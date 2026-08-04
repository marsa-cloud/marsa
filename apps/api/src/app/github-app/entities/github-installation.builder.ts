import type { GitHubAppUuid } from '#src/app/github-app/entities/github-app.uuid.js'
import type { GitHubInstallation } from '#src/app/github-app/entities/github-installation.table.js'
import type { GitHubInstallationUuid } from '#src/app/github-app/entities/github-installation.uuid.js'
import { generateUuid } from '#src/utils/uuid.js'

export class GitHubInstallationBuilder {
  private readonly installation: GitHubInstallation

  constructor() {
    const now = new Date()
    this.installation = {
      uuid: generateUuid<GitHubInstallationUuid>(),
      installationId: '1',
      accountLogin: null,
      appUuid: generateUuid<GitHubAppUuid>(),
      createdAt: now,
      updatedAt: now,
    }
  }

  withInstallationId(installationId: string): this {
    this.installation.installationId = installationId
    return this
  }

  withAccountLogin(accountLogin: string | null): this {
    this.installation.accountLogin = accountLogin
    return this
  }

  withAppUuid(appUuid: GitHubAppUuid): this {
    this.installation.appUuid = appUuid
    return this
  }

  build(): GitHubInstallation {
    return this.installation
  }
}
