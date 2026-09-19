import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import type { AppPlacement } from '#src/app/app-management/entities/app-placement.js'
import type { Release } from '#src/app/release/entities/release.table.js'
import { DeployStatus } from '#src/app/release/enums/deploy-status.enum.js'
import { ApplyReleaseService } from '#src/app/release/services/apply-release/apply-release.service.js'
import { DeployReleaseRepository } from '#src/app/release/use-cases/deploy-release/deploy-release.repository.js'
import { DeployReleaseResponse } from '#src/app/release/use-cases/deploy-release/deploy-release.response.js'

// Deploys the app's newest release: releases are append-only, so the newest is what should run.
@Injectable()
export class DeployReleaseUseCase {
  constructor(
    private readonly repository: DeployReleaseRepository,
    private readonly applyRelease: ApplyReleaseService,
  ) {}

  async execute(slug: string): Promise<DeployReleaseResponse> {
    const found = await this.repository.findAppWithNewestRelease(slug)
    if (!found) {
      throw new NotFoundException(`App '${slug}' was not found.`)
    }
    const { placement, release } = found
    if (!release) {
      throw new ConflictException(`App '${slug}' has no release to deploy. Create one first.`)
    }

    const deployStatus =
      release.deployStatus === DeployStatus.Succeeded
        ? await this.reapplyRunning(placement, release)
        : await this.rollOut(placement, release)

    return new DeployReleaseResponse(
      placement.app.slug,
      { ...release, deployStatus },
      this.applyRelease.baseDomain,
    )
  }

  // Already live, so the apply is a cluster no-op; a failed retry must not mark it failed.
  private async reapplyRunning(placement: AppPlacement, release: Release): Promise<DeployStatus> {
    await this.applyRelease.apply(placement, release)
    return release.deployStatus
  }

  private async rollOut(placement: AppPlacement, release: Release): Promise<DeployStatus> {
    await this.repository.setDeployStatus(release.uuid, DeployStatus.Pending)
    try {
      await this.applyRelease.apply(placement, release)
    } catch (error) {
      await this.repository.setDeployStatus(release.uuid, DeployStatus.Failed)
      throw error
    }
    return DeployStatus.Pending
  }
}
