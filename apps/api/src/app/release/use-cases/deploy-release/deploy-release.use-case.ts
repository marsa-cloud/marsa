import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { AppPlacement } from '#src/app/app-management/queries/app-placement.js'
import type { Release } from '#src/app/release/entities/release.table.js'
import { deploySpecOf } from '#src/app/release/entities/release-deploy-spec.js'
import { DeployStatus } from '#src/app/release/enums/deploy-status.enum.js'
import { DeployReleaseRepository } from '#src/app/release/use-cases/deploy-release/deploy-release.repository.js'
import { DeployReleaseResponse } from '#src/app/release/use-cases/deploy-release/deploy-release.response.js'
import { ImagePullCredentialsCipher } from '#src/modules/crypto/image-pull-credentials.cipher.js'
import { AppRuntime } from '#src/modules/runtime/app-runtime.js'
import { EnvironmentConflictError } from '#src/modules/runtime/runtime.errors.js'

// Deploys the app's newest release: releases are append-only, so the newest is what should run.
@Injectable()
export class DeployReleaseUseCase {
  private readonly baseDomain: string

  constructor(
    private readonly repository: DeployReleaseRepository,
    private readonly appRuntime: AppRuntime,
    private readonly cipher: ImagePullCredentialsCipher,
    config: ConfigService,
  ) {
    this.baseDomain = config.getOrThrow<string>('MARSA_BASE_DOMAIN')
  }

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
      this.baseDomain,
    )
  }

  // Already live, so the deploy is a runtime no-op; a failed retry must not mark it failed.
  private async reapplyRunning(placement: AppPlacement, release: Release): Promise<DeployStatus> {
    await this.deploy(placement, release)
    return release.deployStatus
  }

  private async rollOut(placement: AppPlacement, release: Release): Promise<DeployStatus> {
    await this.repository.setDeployStatus(release.uuid, DeployStatus.Pending)
    try {
      await this.deploy(placement, release)
    } catch (error) {
      await this.repository.setDeployStatus(release.uuid, DeployStatus.Failed)
      throw error
    }
    return DeployStatus.Pending
  }

  private async deploy(placement: AppPlacement, release: Release): Promise<void> {
    const sealed = release.imagePullCredentialsEnc
    const credentials = sealed ? this.cipher.openForApp(placement.app.slug, sealed) : undefined
    const { app, spec } = deploySpecOf(placement, release, {
      baseDomain: this.baseDomain,
      credentials,
    })
    try {
      await this.appRuntime.deploy(app, spec)
    } catch (error) {
      if (error instanceof EnvironmentConflictError) {
        throw new ConflictException(error.message)
      }
      throw error
    }
  }
}
