import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { AppPlacement } from '#src/app/app-management/queries/app-placement.js'
import type { Release } from '#src/app/release/entities/release.table.js'
import { deploySpecOf } from '#src/app/release/entities/release-deploy-spec.js'
import { DeployStatus } from '#src/app/release/enums/deploy-status.enum.js'
import { DeployReleaseRepository } from '#src/app/release/use-cases/deploy-release/deploy-release.repository.js'
import { DeployReleaseResponse } from '#src/app/release/use-cases/deploy-release/deploy-release.response.js'
import { ImagePullCredentialsCipher } from '#src/modules/crypto/image-pull-credentials.cipher.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'
import { AppRuntime } from '#src/modules/runtime/app-runtime.js'

// Deploys the app's newest release: releases are append-only, so the newest is what should run.
@Injectable()
export class DeployReleaseUseCase {
  private readonly baseDomain: string

  constructor(
    @InjectDatabase() private readonly db: Database,
    private readonly repository: DeployReleaseRepository,
    private readonly appRuntime: AppRuntime,
    private readonly cipher: ImagePullCredentialsCipher,
    config: ConfigService,
  ) {
    this.baseDomain = config.getOrThrow<string>('MARSA_BASE_DOMAIN')
  }

  async execute(slug: string): Promise<DeployReleaseResponse> {
    const attempt: { rollingOut?: Release } = {}
    try {
      return await this.db.transaction(async (tx) => {
        const placement = await this.repository.findPlacement(tx, slug)
        if (!placement) {
          throw new NotFoundException(`App '${slug}' was not found.`)
        }
        const release = await this.repository.findNewestRelease(tx, placement.app.uuid)
        if (!release) {
          throw new ConflictException(`App '${slug}' has no release to deploy. Create one first.`)
        }

        // Already live, so the deploy is a runtime no-op; a failed retry must not mark it failed.
        if (release.deployStatus !== DeployStatus.Succeeded) {
          attempt.rollingOut = release
          await this.repository.setDeployStatus(tx, release.uuid, DeployStatus.Pending)
        }
        await this.deploy(placement, release)

        const deployStatus = attempt.rollingOut ? DeployStatus.Pending : release.deployStatus
        return new DeployReleaseResponse(
          placement.app.slug,
          { ...release, deployStatus },
          this.baseDomain,
        )
      })
    } catch (error) {
      // The rollback undid Pending; Failed is written on its own so the failure stays visible.
      if (attempt.rollingOut) {
        await this.repository.markFailed(attempt.rollingOut.uuid)
      }
      throw error
    }
  }

  private async deploy(placement: AppPlacement, release: Release): Promise<void> {
    const credentials = this.cipher.openForApp(placement.app.slug, release.imagePullCredentialsEnc)
    const spec = deploySpecOf(placement, release, { baseDomain: this.baseDomain, credentials })
    await this.appRuntime.deploy(placement, spec)
  }
}
