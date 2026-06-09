import { GitHubApp } from '#src/app/github-app/entities/github-app.entity.js'

/**
 * Fluent builder for {@link GitHubApp}. Keeps the use-case free of field-by-field
 * mutation for a secret-bearing, 9-field entity. Encryption stays the caller's job —
 * the builder takes already-encrypted `*Enc` values so it has no service dependencies.
 */
export class GitHubAppBuilder {
  private readonly app = new GitHubApp()

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
