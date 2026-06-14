import { GitHubApp } from '#src/app/github-app/entities/github-app.entity.js'

/** Takes already-encrypted `*Enc` values — encryption stays the caller's job. */
export class GitHubAppBuilder {
  private readonly app: GitHubApp

  constructor() {
    this.app = new GitHubApp()
    this.app.githubAppId = '42'
    this.app.slug = 'marsa-app'
    this.app.name = 'marsa'
    this.app.htmlUrl = 'https://github.com/apps/marsa-app'
    this.app.clientId = 'client-id'
    this.app.clientSecretEnc = 'enc-client-secret'
    this.app.webhookSecretEnc = 'enc-webhook-secret'
    this.app.privateKeyPemEnc = 'enc-private-key-pem'
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
    this.app.ownerLogin = ownerLogin ?? undefined
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
