import { EntityManager } from '@mikro-orm/core'
import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common'

import { GitHubApp } from '#src/app/github-app/entities/github-app.entity.js'
import {
  type GitHubAppCredentials,
  GitHubManifestClient,
} from '#src/app/github-app/github-manifest.client.js'
import { StateSigner } from '#src/app/github-app/state-signer.js'
import { ConvertManifestRequest } from '#src/app/github-app/use-cases/convert-manifest/convert-manifest.request.js'
import type { ConvertManifestResponse } from '#src/app/github-app/use-cases/convert-manifest/convert-manifest.response.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'

@Injectable()
export class ConvertManifestService {
  private readonly logger = new Logger(ConvertManifestService.name)

  constructor(
    private readonly em: EntityManager,
    private readonly stateSigner: StateSigner,
    private readonly client: GitHubManifestClient,
    private readonly cipher: SecretCipherService,
  ) {}

  async execute(request: ConvertManifestRequest): Promise<ConvertManifestResponse> {
    if (typeof request.code !== 'string' || request.code.length === 0) {
      throw new BadRequestException('code is required')
    }
    if (typeof request.state !== 'string' || !this.stateSigner.verify(request.state)) {
      throw new BadRequestException('invalid or expired state')
    }

    let creds: GitHubAppCredentials
    try {
      creds = await this.client.convertManifest(request.code)
    } catch (error) {
      // Log the upstream detail server-side; don't leak GitHub's raw error to the client.
      this.logger.error(`GitHub manifest conversion failed: ${(error as Error).message}`)
      throw new BadGatewayException('Could not complete GitHub App creation with GitHub.')
    }

    const app = new GitHubApp()
    app.githubAppId = String(creds.id)
    app.slug = creds.slug
    app.name = creds.name
    app.htmlUrl = creds.htmlUrl
    app.ownerLogin = creds.ownerLogin ?? undefined
    app.clientId = creds.clientId
    app.clientSecretEnc = this.cipher.encrypt(creds.clientSecret)
    app.webhookSecretEnc = this.cipher.encrypt(creds.webhookSecret)
    app.privateKeyPemEnc = this.cipher.encrypt(creds.pem)

    // fork() gives a clean EM independent of request-context middleware.
    await this.em.fork().persistAndFlush(app)

    return {
      appSlug: creds.slug,
      appName: creds.name,
      htmlUrl: creds.htmlUrl,
      installUrl: `${creds.htmlUrl}/installations/new`,
    }
  }
}
