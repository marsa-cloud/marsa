import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common'

import { CaptureInstallationCommand } from '#src/app/github-app/use-cases/capture-installation/capture-installation.command.js'
import { CaptureInstallationRepository } from '#src/app/github-app/use-cases/capture-installation/capture-installation.repository.js'
import { CaptureInstallationResponse } from '#src/app/github-app/use-cases/capture-installation/capture-installation.response.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import { GithubClient } from '#src/modules/github-client/github-client.js'

@Injectable()
export class CaptureInstallationUseCase {
  private readonly logger = new Logger(CaptureInstallationUseCase.name)

  constructor(
    private readonly repository: CaptureInstallationRepository,
    private readonly github: GithubClient,
    private readonly cipher: SecretCipherService,
  ) {}

  async execute(command: CaptureInstallationCommand): Promise<CaptureInstallationResponse> {
    // Field presence/type and the `setup_action === install` rule are enforced at
    // the DTO boundary by class-validator (`@Matches`, `@IsIn`), so they aren't
    // re-checked here.
    const app = await this.repository.loadProvisionedApp()
    if (!app) {
      throw new BadRequestException('No provisioned GitHub App — create the App first.')
    }

    // Decrypt the stored PEM up front, outside the GitHub call's try/catch, so a
    // local decrypt/config failure surfaces as itself rather than being
    // misreported as a GitHub verification (502) error.
    const privateKeyPem = this.cipher.decrypt(app.privateKeyPemEnc)

    // Mint an installation token once. This signs the App JWT with the PEM and
    // exchanges it at GitHub, which only succeeds if the installation is real and
    // belongs to our App — so it doubles as verification before we persist.
    try {
      await this.github.getInstallationToken({
        githubAppId: app.githubAppId,
        privateKeyPem,
        installationId: command.installationId,
      })
    } catch (error) {
      this.logger.error(`installation verification failed: ${(error as Error).message}`)
      throw new BadGatewayException('Could not verify the installation with GitHub.')
    }

    const installation = await this.repository.upsertByInstallationId(
      command.installationId,
      app.uuid,
    )

    return new CaptureInstallationResponse(installation)
  }
}
