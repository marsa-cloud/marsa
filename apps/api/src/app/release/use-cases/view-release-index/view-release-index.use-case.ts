import { Injectable } from '@nestjs/common'
import type { Release } from '#src/app/release/entities/release.table.js'
import { DeployStatus } from '#src/app/release/enums/deploy-status.enum.js'
import { ViewReleaseIndexQuery } from '#src/app/release/use-cases/view-release-index/query/view-release-index.query.js'
import { ViewReleaseIndexRepository } from '#src/app/release/use-cases/view-release-index/view-release-index.repository.js'
import {
  type ReleaseHead,
  ViewReleaseIndexResponse,
} from '#src/app/release/use-cases/view-release-index/view-release-index.response.js'
import { AppRuntime } from '#src/modules/runtime/app-runtime.js'
import { RolloutStatus } from '#src/modules/runtime/runtime.enums.js'
import { type AppRef } from '#src/modules/runtime/runtime.types.js'
import { keysetLimit } from '#src/utils/pagination/pagination-mapper.js'

const TERMINAL_STATUSES: ReadonlySet<DeployStatus> = new Set([
  DeployStatus.Succeeded,
  DeployStatus.Failed,
])

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
    private readonly appRuntime: AppRuntime,
  ) {}

  async execute(slug: string, query: ViewReleaseIndexQuery): Promise<ViewReleaseIndexResponse> {
    const releases = await this.repository.findByAppSlug(
      slug,
      keysetLimit(query.pagination),
      query.pagination?.key?.uuid,
    )

    // Refresh-on-read (AgDR-0034) is head-only, and the head only exists on the first page.
    const head = query.pagination?.key == null ? await this.refreshHead(releases, slug) : null

    return new ViewReleaseIndexResponse(releases, head)
  }

  private async refreshHead(releases: Release[], slug: string): Promise<ReleaseHead | null> {
    const head = releases.at(0)
    if (!head) return null
    const placement = await this.repository.findPlacement(slug)
    if (!placement) return null

    const deployStatus = TERMINAL_STATUSES.has(head.deployStatus)
      ? head.deployStatus
      : await this.reconcile(head, placement)

    // A failure reason is read live from the pods (never stored, #115), and only the head
    // maps to the live Deployment — no older release's failure can be described this way.
    const failure =
      deployStatus === DeployStatus.Failed
        ? await this.appRuntime.readDeployFailure(placement)
        : null

    return { uuid: head.uuid, deployStatus, failure }
  }

  private async reconcile(release: Release, app: AppRef): Promise<DeployStatus> {
    // A release that was created but never deployed must not inherit the live rollout.
    const live = await this.appRuntime.readLiveReleaseUuid(app)
    if (live !== release.uuid) return release.deployStatus

    const rollout = await this.appRuntime.readRolloutStatus(app)
    const observed = toDeployStatus(rollout)

    // `null` (NotFound) is absence of observation, never a state — persisting one there
    // would repeat the #98 false negative (pod not yet observable → wrongly terminal).
    if (observed === null || observed === release.deployStatus) return release.deployStatus

    await this.repository.setReleaseDeployStatus(release.uuid, observed)
    return observed
  }
}
