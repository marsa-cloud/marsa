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

export const DEFAULT_ROOT_DIR = '.'
export const DEFAULT_DOCKERFILE_PATH = 'Dockerfile'
export const BRANCH_MAX_LENGTH = 255

export const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/

// Relative, and never climbing out of the repo with a `..` segment.
export const SOURCE_PATH_PATTERN = /^(?!\/)(?!(?:.*\/)?\.\.(?:\/|$))[\w.\-/]+$/
