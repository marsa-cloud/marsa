import type { Ref } from '@mikro-orm/core'
import type { GitHubApp } from '#src/app/github-app/entities/github-app.entity.js'
import { GitHubInstallation } from '#src/app/github-app/entities/github-installation.entity.js'

export class GitHubInstallationBuilder {
  private readonly installation: GitHubInstallation

  constructor() {
    this.installation = new GitHubInstallation()
    this.installation.installationId = '1'
    this.installation.accountLogin = null
  }

  withInstallationId(installationId: string): this {
    this.installation.installationId = installationId
    return this
  }

  withAccountLogin(accountLogin: string | null): this {
    this.installation.accountLogin = accountLogin
    return this
  }

  withApp(app: Ref<GitHubApp>): this {
    this.installation.app = app
    return this
  }

  build(): GitHubInstallation {
    return this.installation
  }
}
