import { Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { AppPlacement } from '#src/app/app-management/entities/app-placement.js'
import { ViewAppDetailRepository } from '#src/app/app-management/use-cases/view-app-detail/view-app-detail.repository.js'
import { ViewAppDetailResponse } from '#src/app/app-management/use-cases/view-app-detail/view-app-detail.response.js'
import { namespaceOf } from '#src/app/environment/entities/namespace.js'
import type { ReleaseUuid } from '#src/app/release/entities/release.uuid.js'
import { isSnapshotOf } from '#src/app/release/entities/release-snapshot.js'
import { DeployBackend } from '#src/modules/kubernetes/deploy-backend.js'

@Injectable()
export class ViewAppDetailUseCase {
  constructor(
    private readonly repository: ViewAppDetailRepository,
    private readonly deployBackend: DeployBackend,
    private readonly config: ConfigService,
  ) {}

  async execute(slug: string): Promise<ViewAppDetailResponse> {
    const placement = await this.repository.findBySlug(slug)
    if (!placement) {
      throw new NotFoundException(`App '${slug}' was not found.`)
    }

    return new ViewAppDetailResponse(
      placement,
      this.config.getOrThrow<string>('MARSA_BASE_DOMAIN'),
      await this.hasUndeployedChanges(placement),
    )
  }

  // Compared against what the cluster runs, not the newest row: a release can exist yet never ship.
  private async hasUndeployedChanges({
    app,
    project,
    environment,
  }: AppPlacement): Promise<boolean> {
    let liveUuid: string | null
    try {
      liveUuid = await this.deployBackend.readLiveReleaseUuid(
        namespaceOf(project, environment),
        app.slug,
      )
    } catch {
      // Unknown is not "changed"; the health card is where an unreachable cluster shows up.
      return false
    }
    const live = liveUuid && (await this.repository.findRelease(liveUuid as ReleaseUuid, app.uuid))
    return !live || !isSnapshotOf(live, app)
  }
}
