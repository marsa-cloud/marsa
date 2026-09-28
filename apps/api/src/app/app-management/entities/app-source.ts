import type { GitHubInstallationUuid } from '#src/app/github-app/entities/github-installation.uuid.js'

export interface GitHubAppSource {
  type: 'github'
  installationUuid: GitHubInstallationUuid
  repo: string
  branch: string
  rootDir: string
  dockerfilePath: string
}

export type AppSource = GitHubAppSource
