import type { GitHubApp } from '#src/app/github-app/entities/github-app.table.js'
import type { GitHubAppUuid } from '#src/app/github-app/entities/github-app.uuid.js'
import { generateUuid } from '#src/utils/uuid.js'

/** Takes already-encrypted `*Enc` values — encryption stays the caller's job. */
export class GitHubAppBuilder {
  private readonly app: GitHubApp

  constructor() {
    const now = new Date()
    this.app = {
      uuid: generateUuid<GitHubAppUuid>(),
      githubAppId: '42',
      slug: 'marsa-app',
      name: 'marsa',
      htmlUrl: 'https://github.com/apps/marsa-app',
      ownerLogin: null,
      clientId: 'client-id',
      clientSecretEnc: 'enc-client-secret',
      webhookSecretEnc: 'enc-webhook-secret',
      privateKeyPemEnc: 'enc-private-key-pem',
      createdAt: now,
      updatedAt: now,
    }
  }

  withGithubAppId(githubAppId: string): this {
    this.app.githubAppId = githubAppId
    return this
  }

  withSlug(slug: string): this {
    this.app.slug = slug
    return this
  }

  withName(name: string): this {
    this.app.name = name
    return this
  }

  withHtmlUrl(htmlUrl: string): this {
    this.app.htmlUrl = htmlUrl
    return this
  }

  withOwnerLogin(ownerLogin: string | null): this {
    this.app.ownerLogin = ownerLogin
    return this
  }

  withClientId(clientId: string): this {
    this.app.clientId = clientId
    return this
  }

  withClientSecretEnc(clientSecretEnc: string): this {
    this.app.clientSecretEnc = clientSecretEnc
    return this
  }

  withWebhookSecretEnc(webhookSecretEnc: string): this {
    this.app.webhookSecretEnc = webhookSecretEnc
    return this
  }

  withPrivateKeyPemEnc(privateKeyPemEnc: string): this {
    this.app.privateKeyPemEnc = privateKeyPemEnc
    return this
  }

  build(): GitHubApp {
    return this.app
  }
}
