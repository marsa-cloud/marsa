import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import type { ReleaseUuid } from '#src/app/release/entities/release.uuid.js'
import { DeployStatus } from '#src/app/release/enums/deploy-status.enum.js'
import { ApplyReleaseService } from '#src/app/release/services/apply-release/apply-release.service.js'
import { DeployReleaseRepository } from '#src/app/release/use-cases/deploy-release/deploy-release.repository.js'
import { DeployReleaseResponse } from '#src/app/release/use-cases/deploy-release/deploy-release.response.js'

@Injectable()
export class DeployReleaseUseCase {
  constructor(
    private readonly repository: DeployReleaseRepository,
    private readonly applyRelease: ApplyReleaseService,
  ) {}

  async execute(uuid: ReleaseUuid): Promise<DeployReleaseResponse> {
    const release = await this.repository.findRelease(uuid)
    const app = release && (await this.repository.findApp(release.appUuid))
    if (!release || !app) {
      throw new NotFoundException(`Release '${uuid}' was not found.`)
    }

    // The release list reconciles only the newest release, so deploying an older one would lie.
    if ((await this.repository.findNewestReleaseUuid(app.uuid)) !== release.uuid) {
      throw new ConflictException(
        `Release '${uuid}' is not the newest release of '${app.slug}'. Create a release from it to roll back.`,
      )
    }

    await this.repository.setDeployStatus(release.uuid, DeployStatus.Pending)
    try {
      await this.applyRelease.apply(app.slug, release)
    } catch (error) {
      await this.repository.setDeployStatus(release.uuid, DeployStatus.Failed)
      throw error
    }

    return new DeployReleaseResponse(
      app.slug,
      { ...release, deployStatus: DeployStatus.Pending },
      this.applyRelease.baseDomain,
    )
  }
}
