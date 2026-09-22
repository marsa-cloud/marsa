import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { AppPlacement } from '#src/app/app-management/queries/app-placement.js'
import type { Release } from '#src/app/release/entities/release.table.js'
import { deploySpecOf } from '#src/app/release/entities/release-deploy-spec.js'
import { DeployStatus } from '#src/app/release/enums/deploy-status.enum.js'
import { DeployReleaseRepository } from '#src/app/release/use-cases/deploy-release/deploy-release.repository.js'
import { DeployReleaseResponse } from '#src/app/release/use-cases/deploy-release/deploy-release.response.js'
import { ImagePullCredentialsCipher } from '#src/modules/crypto/image-pull-credentials.cipher.js'
import type { Database, Transaction } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'
import { AppRuntime } from '#src/modules/runtime/app-runtime.js'

type Outcome =
  | { deployed: true; response: DeployReleaseResponse }
  | { deployed: false; error: unknown }

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
    const outcome = await this.db.transaction((tx) => this.deployNewest(tx, slug))
    if (!outcome.deployed) {
      throw outcome.error
    }
    return outcome.response
  }

  private async deployNewest(tx: Transaction, slug: string): Promise<Outcome> {
    const placement = await this.repository.findPlacement(tx, slug)
    if (!placement) {
      throw new NotFoundException(`App '${slug}' was not found.`)
    }
    const release = await this.repository.findNewestRelease(tx, placement.app.uuid)
    if (!release) {
      throw new ConflictException(`App '${slug}' has no release to deploy. Create one first.`)
    }

    // Already live, so the deploy is a runtime no-op; a failed retry must not mark it failed.
    if (release.deployStatus === DeployStatus.Succeeded) {
      await this.deploy(placement, release)
      return this.deployed(placement, release, DeployStatus.Succeeded)
    }

    try {
      await tx.transaction(async (savepoint) => {
        await this.repository.setDeployStatus(savepoint, release.uuid, DeployStatus.Pending)
        await this.deploy(placement, release)
      })
    } catch (error) {
      // Written under the same app lock, so a concurrent retry cannot land between rollback and this.
      await this.repository.setDeployStatus(tx, release.uuid, DeployStatus.Failed)
      return { deployed: false, error }
    }
    return this.deployed(placement, release, DeployStatus.Pending)
  }

  private async deploy(placement: AppPlacement, release: Release): Promise<void> {
    const credentials = this.cipher.openForApp(placement.app.slug, release.imagePullCredentialsEnc)
    const spec = deploySpecOf(placement, release, { baseDomain: this.baseDomain, credentials })
    await this.appRuntime.deploy(placement, spec)
  }

  private deployed(placement: AppPlacement, release: Release, deployStatus: DeployStatus): Outcome {
    const response = new DeployReleaseResponse(
      placement.app.slug,
      { ...release, deployStatus },
      this.baseDomain,
    )
    return { deployed: true, response }
  }
}
