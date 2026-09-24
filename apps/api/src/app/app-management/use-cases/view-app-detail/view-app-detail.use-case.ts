import { Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { AppPlacement } from '#src/app/app-management/queries/app-placement.js'
import { ViewAppDetailRepository } from '#src/app/app-management/use-cases/view-app-detail/view-app-detail.repository.js'
import { ViewAppDetailResponse } from '#src/app/app-management/use-cases/view-app-detail/view-app-detail.response.js'
import type { ReleaseUuid } from '#src/app/release/entities/release.uuid.js'
import { isSnapshotOf } from '#src/app/release/entities/release-snapshot.js'
import { AppRuntime } from '#src/modules/runtime/app-runtime.js'
import { InvalidReleaseAnnotationError } from '#src/modules/runtime/runtime.errors.js'

@Injectable()
export class ViewAppDetailUseCase {
  constructor(
    private readonly repository: ViewAppDetailRepository,
    private readonly appRuntime: AppRuntime,
    private readonly config: ConfigService,
  ) {}

  async execute(slug: string): Promise<ViewAppDetailResponse> {
    const placement = await this.repository.findBySlug(slug)
    if (!placement) {
      throw new NotFoundException(`App '${slug}' was not found.`)
    }

    const hasUndeployedChanges = await this.hasUndeployedChanges(placement)
    return new ViewAppDetailResponse(
      placement,
      this.config.getOrThrow<string>('MARSA_BASE_DOMAIN'),
      hasUndeployedChanges,
    )
  }

  // Compared against what the cluster runs, not the newest row: a release can exist yet never ship.
  private async hasUndeployedChanges(placement: AppPlacement): Promise<boolean> {
    // Before the first build there is nothing to deploy; the builds list shows progress instead.
    if (placement.app.image === null) {
      return false
    }
    let liveUuid: ReleaseUuid | null
    try {
      liveUuid = await this.appRuntime.readLiveReleaseUuid(placement)
    } catch (error) {
      // A malformed annotation is a Marsa bug, not an unreachable cluster, so it must not be hidden.
      if (error instanceof InvalidReleaseAnnotationError) throw error
      // Unknown is not "changed"; the health card is where an unreachable cluster shows up.
      return false
    }
    if (!liveUuid) {
      return true
    }

    const live = await this.repository.findRelease(liveUuid, placement.app.uuid)
    return !live || !isSnapshotOf(live, placement.app)
  }
}
