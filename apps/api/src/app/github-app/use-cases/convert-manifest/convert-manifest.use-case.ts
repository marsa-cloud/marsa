import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common'
import { GitHubAppBuilder } from '#src/app/github-app/entities/github-app.builder.js'
import { ManifestStateService } from '#src/app/github-app/manifest-state/manifest-state.service.js'
import { ConvertManifestCommand } from '#src/app/github-app/use-cases/convert-manifest/convert-manifest.command.js'
import { ConvertManifestRepository } from '#src/app/github-app/use-cases/convert-manifest/convert-manifest.repository.js'
import { ConvertManifestResponse } from '#src/app/github-app/use-cases/convert-manifest/convert-manifest.response.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import { GithubClient } from '#src/modules/github-client/github-client.js'
import type { GitHubAppCredentials } from '#src/modules/github-client/github-client.types.js'

@Injectable()
export class ConvertManifestUseCase {
  private readonly logger = new Logger(ConvertManifestUseCase.name)

  constructor(
    private readonly manifestState: ManifestStateService,
    private readonly repository: ConvertManifestRepository,
    private readonly client: GithubClient,
    private readonly cipher: SecretCipherService,
  ) {}

  async execute(command: ConvertManifestCommand): Promise<ConvertManifestResponse> {
    // Presence/type of `code` and `state` is enforced by class-validator on the
    // command DTO; the only check left here is the business rule that the state
    // token is valid and unconsumed.
    if (!(await this.manifestState.consume(command.state))) {
      throw new BadRequestException('invalid or expired state')
    }

    let creds: GitHubAppCredentials
    try {
      creds = await this.client.convertManifest(command.code)
    } catch (error) {
      // Log the upstream detail server-side; don't leak GitHub's raw error to the client.
      this.logger.error(`GitHub manifest conversion failed: ${(error as Error).message}`)
      throw new BadGatewayException('Could not complete GitHub App creation with GitHub.')
    }

    const app = new GitHubAppBuilder()
      .withGithubAppId(String(creds.id))
      .withSlug(creds.slug)
      .withName(creds.name)
      .withHtmlUrl(creds.htmlUrl)
      .withOwnerLogin(creds.ownerLogin)
      .withClientId(creds.clientId)
      .withClientSecretEnc(this.cipher.encrypt(creds.clientSecret))
      .withWebhookSecretEnc(this.cipher.encrypt(creds.webhookSecret))
      .withPrivateKeyPemEnc(this.cipher.encrypt(creds.pem))
      .build()

    await this.repository.upsertByGithubAppId(app)

    return new ConvertManifestResponse(app)
  }
}
