import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common'

import { CaptureInstallationCommand } from '#src/app/github-app/use-cases/capture-installation/capture-installation.command.js'
import { CaptureInstallationRepository } from '#src/app/github-app/use-cases/capture-installation/capture-installation.repository.js'
import { CaptureInstallationResponse } from '#src/app/github-app/use-cases/capture-installation/capture-installation.response.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import { GitHubInstallationTokenService } from '#src/modules/github-client/github-installation-token.service.js'

const INSTALL_ACTION = 'install'

@Injectable()
export class CaptureInstallationUseCase {
  private readonly logger = new Logger(CaptureInstallationUseCase.name)

  constructor(
    private readonly repository: CaptureInstallationRepository,
    private readonly tokens: GitHubInstallationTokenService,
    private readonly cipher: SecretCipherService,
  ) {}

  async execute(command: CaptureInstallationCommand): Promise<CaptureInstallationResponse> {
    // Presence/type of the fields is enforced by class-validator; the only check
    // left is the business rule that this redirect is an install (not e.g. a
    // `request` setup_action from the App's "request to install" flow).
    if (command.setupAction !== INSTALL_ACTION) {
      throw new BadRequestException(`Unsupported setup_action: ${command.setupAction}`)
    }

    const app = await this.repository.loadProvisionedApp()
    if (!app) {
      throw new BadRequestException('No provisioned GitHub App — create the App first.')
    }

    // Mint an installation token once. This signs the App JWT with the stored PEM
    // and exchanges it at GitHub, which only succeeds if the installation is real
    // and belongs to our App — so it doubles as verification before we persist.
    try {
      await this.tokens.getInstallationToken({
        githubAppId: app.githubAppId,
        privateKeyPem: this.cipher.decrypt(app.privateKeyPemEnc),
        installationId: command.installationId,
      })
    } catch (error) {
      this.logger.error(`installation verification failed: ${(error as Error).message}`)
      throw new BadGatewayException('Could not verify the installation with GitHub.')
    }

    const installation = await this.repository.upsertByInstallationId(
      command.installationId,
      app.id,
    )

    return new CaptureInstallationResponse(installation)
  }
}
