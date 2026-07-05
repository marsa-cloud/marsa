import { Injectable } from '@nestjs/common'

import type { Release } from '#src/app/deployments/entities/release.entity.js'
import { DeployStatus } from '#src/app/deployments/enums/deploy-status.enum.js'
import { ListAppReleasesRepository } from '#src/app/deployments/use-cases/list-app-releases/list-app-releases.repository.js'
import { ListAppReleasesResponse } from '#src/app/deployments/use-cases/list-app-releases/list-app-releases.response.js'
import { OPERATOR_APPS_NAMESPACE } from '#src/modules/kubernetes/deploy-backend.constants.js'
import { DeployBackend } from '#src/modules/kubernetes/deploy-backend.js'
import { RolloutStatus } from '#src/modules/kubernetes/rollout-status.js'

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
export class ListAppReleasesUseCase {
  constructor(
    private readonly repository: ListAppReleasesRepository,
    private readonly deployBackend: DeployBackend,
  ) {}

  async execute(slug: string): Promise<ListAppReleasesResponse> {
    const releases = await this.repository.findByAppSlug(slug)

    // Refresh-on-read (AgDR-0034): only the newest release (releases[0], desc
    // by createdAt) maps to the current per-app Deployment, so only it is
    // eligible. If the head is already terminal there is nothing to reconcile;
    // an older non-terminal release is superseded by a newer deploy and must be
    // left untouched — reconciling it would stamp it with the newer rollout's
    // outcome.
    const [latest] = releases
    if (latest && !TERMINAL_STATUSES.has(latest.deployStatus)) {
      await this.reconcile(latest, slug)
    }

    return new ListAppReleasesResponse(releases)
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
