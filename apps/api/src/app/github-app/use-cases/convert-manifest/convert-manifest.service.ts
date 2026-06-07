import { EntityManager } from '@mikro-orm/core'
import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common'

import { GitHubApp } from '#src/app/github-app/entities/github-app.entity.js'
import { GitHubManifestClient } from '#src/app/github-app/github-manifest.client.js'
import { StateSigner } from '#src/app/github-app/state-signer.js'
import { ConvertManifestRequest } from '#src/app/github-app/use-cases/convert-manifest/convert-manifest.request.js'
import type { ConvertManifestResponse } from '#src/app/github-app/use-cases/convert-manifest/convert-manifest.response.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'

@Injectable()
export class ConvertManifestService {
  constructor(
    private readonly em: EntityManager,
    private readonly stateSigner: StateSigner,
    private readonly client: GitHubManifestClient,
    private readonly cipher: SecretCipherService,
  ) {}

  async execute(request: ConvertManifestRequest): Promise<ConvertManifestResponse> {
    if (!request.code) {
      throw new BadRequestException('code is required')
    }
    if (!this.stateSigner.verify(request.state)) {
      throw new BadRequestException('invalid or expired state')
    }

    let creds
    try {
      creds = await this.client.convertManifest(request.code)
    } catch (error) {
      throw new BadGatewayException((error as Error).message)
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
