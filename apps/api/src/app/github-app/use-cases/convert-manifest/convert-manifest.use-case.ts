import { EntityManager } from '@mikro-orm/core'
import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common'

import { GitHubAppBuilder } from '#src/app/github-app/entities/github-app.builder.js'
import { StateSigner } from '#src/app/github-app/state-signer.js'
import { ConvertManifestCommand } from '#src/app/github-app/use-cases/convert-manifest/convert-manifest.command.js'
import { ConvertManifestResponse } from '#src/app/github-app/use-cases/convert-manifest/convert-manifest.response.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import type { GitHubAppCredentials } from '#src/modules/github-client/github-client.types.js'
import { GitHubManifestClient } from '#src/modules/github-client/github-manifest.client.js'

@Injectable()
export class ConvertManifestUseCase {
  private readonly logger = new Logger(ConvertManifestUseCase.name)

  constructor(
    private readonly em: EntityManager,
    private readonly stateSigner: StateSigner,
    private readonly client: GitHubManifestClient,
    private readonly cipher: SecretCipherService,
  ) {}

  async execute(command: ConvertManifestCommand): Promise<ConvertManifestResponse> {
    if (typeof command.code !== 'string' || command.code.length === 0) {
      throw new BadRequestException('code is required')
    }
    if (typeof command.state !== 'string' || !this.stateSigner.verify(command.state)) {
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

    // fork() gives a clean EM independent of request-context middleware.
    await this.em.fork().persistAndFlush(app)

    return new ConvertManifestResponse(
      creds.slug,
      creds.name,
      creds.htmlUrl,
      `${creds.htmlUrl}/installations/new`,
    )
  }
}
