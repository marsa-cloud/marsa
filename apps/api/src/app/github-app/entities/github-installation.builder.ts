import type { GitHubApp } from '#src/app/github-app/entities/github-app.entity.js'
import { GitHubInstallation } from '#src/app/github-app/entities/github-installation.entity.js'

export class GitHubInstallationBuilder {
  private readonly installation = new GitHubInstallation()

  withInstallationId(installationId: string): this {
    this.installation.installationId = installationId
    return this
  }

  withApp(app: GitHubApp): this {
    this.installation.app = app
    return this
  }

  build(): GitHubInstallation {
    return this.installation
  }
}
