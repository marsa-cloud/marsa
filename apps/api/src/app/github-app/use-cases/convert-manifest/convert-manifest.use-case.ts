import { EntityManager, UniqueConstraintViolationException } from '@mikro-orm/core'
import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common'

import { GitHubAppBuilder } from '#src/app/github-app/entities/github-app.builder.js'
import { GitHubApp } from '#src/app/github-app/entities/github-app.entity.js'
import { ManifestStateService } from '#src/app/github-app/manifest-state/manifest-state.service.js'
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
    private readonly manifestState: ManifestStateService,
    private readonly client: GitHubManifestClient,
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

    const githubAppId = String(creds.id)
    const app = new GitHubAppBuilder()
      .withGithubAppId(githubAppId)
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
    // Idempotent on github_app_id (DB-guarded by a UNIQUE constraint): a
    // re-provision updates the existing row instead of inserting a duplicate.
    const em = this.em.fork()
    const applyCredsTo = async (existing: GitHubApp): Promise<void> => {
      em.assign(existing, {
        slug: app.slug,
        name: app.name,
        htmlUrl: app.htmlUrl,
        ownerLogin: app.ownerLogin,
        clientId: app.clientId,
        clientSecretEnc: app.clientSecretEnc,
        webhookSecretEnc: app.webhookSecretEnc,
        privateKeyPemEnc: app.privateKeyPemEnc,
      })
      await em.flush()
    }

    const existing = await em.findOne(GitHubApp, { githubAppId })
    if (existing) {
      await applyCredsTo(existing)
    } else {
      try {
        await em.persistAndFlush(app)
      } catch (error) {
        // Lost a concurrent insert race on github_app_id — re-resolve as an update.
        if (!(error instanceof UniqueConstraintViolationException)) {
          throw error
        }
        em.clear()
        await applyCredsTo(await em.findOneOrFail(GitHubApp, { githubAppId }))
      }
    }

    return new ConvertManifestResponse(app)
  }
}
