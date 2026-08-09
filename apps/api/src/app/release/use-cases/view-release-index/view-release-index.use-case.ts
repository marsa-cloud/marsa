import { Injectable } from '@nestjs/common'
import type { Release } from '#src/app/release/entities/release.table.js'
import { DeployStatus } from '#src/app/release/enums/deploy-status.enum.js'
import { ViewReleaseIndexQuery } from '#src/app/release/use-cases/view-release-index/query/view-release-index.query.js'
import { ViewReleaseIndexRepository } from '#src/app/release/use-cases/view-release-index/view-release-index.repository.js'
import { ViewReleaseIndexResponse } from '#src/app/release/use-cases/view-release-index/view-release-index.response.js'
import { OPERATOR_APPS_NAMESPACE } from '#src/modules/kubernetes/deploy-backend.constants.js'
import { DeployBackend } from '#src/modules/kubernetes/deploy-backend.js'
import { RolloutStatus } from '#src/modules/kubernetes/rollout-status.js'
import { keysetLimit } from '#src/utils/pagination/pagination-mapper.js'

const TERMINAL_STATUSES: ReadonlySet<DeployStatus> = new Set([
  DeployStatus.Succeeded,
  DeployStatus.Failed,
])

/** Rollout signal → domain status. `NotFound` yields `null`: no state to persist. */
function toDeployStatus(rollout: RolloutStatus): DeployStatus | null {
  switch (rollout) {
    case RolloutStatus.Complete:
      return DeployStatus.Succeeded
    case RolloutStatus.Failed:
      return DeployStatus.Failed
    case RolloutStatus.Progressing:
      return DeployStatus.InProgress
    case RolloutStatus.NotFound:
      return null
  }
}

@Injectable()
export class ViewReleaseIndexUseCase {
  constructor(
    private readonly repository: ViewReleaseIndexRepository,
    private readonly deployBackend: DeployBackend,
  ) {}

  async execute(slug: string, query: ViewReleaseIndexQuery): Promise<ViewReleaseIndexResponse> {
    const releases = await this.repository.findByAppSlug(
      slug,
      keysetLimit(query.pagination),
      query.pagination?.key?.uuid,
    )

    // Refresh-on-read (AgDR-0034) is head-only, and the head only exists on the
    // FIRST page. Page two's releases[0] is an older release, so reconciling
    // there would stamp it with the current rollout's outcome — the #98-class
    // false negative this guard exists to prevent.
    const isFirstPage = query.pagination?.key == null
    const [latest] = isFirstPage ? releases : []

    // If the head is already terminal there is nothing to reconcile; an older
    // non-terminal release is superseded by a newer deploy and must be left
    // untouched.
    if (latest && !TERMINAL_STATUSES.has(latest.deployStatus)) {
      await this.reconcile(latest, slug)
    }

    // A failed head release carries a *why*: read it live from the pods (never
    // stored, #115). Only the head maps to the live Deployment, so this is the
    // only release a cluster-read failure reason can describe.
    const headFailure =
      latest?.deployStatus === DeployStatus.Failed
        ? await this.deployBackend.readDeployFailure(OPERATOR_APPS_NAMESPACE, slug)
        : null

    return new ViewReleaseIndexResponse(releases, headFailure)
  }

  private async reconcile(release: Release, slug: string): Promise<void> {
    const rollout = await this.deployBackend.readRolloutStatus(OPERATOR_APPS_NAMESPACE, slug)
    const observed = toDeployStatus(rollout)

    // Write-on-change only. `null` (NotFound) is absence of observation, never a
    // state — persisting a terminal value there would repeat the #98 false
    // negative (pod not yet observable → wrongly marked terminal).
    if (observed !== null && observed !== release.deployStatus) {
      await this.repository.setReleaseDeployStatus(release.uuid, observed)
      release.deployStatus = observed
    }
  }
}
