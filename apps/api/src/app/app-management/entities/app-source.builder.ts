import {
  DEFAULT_DOCKERFILE_PATH,
  DEFAULT_ROOT_DIR,
  type GitHubAppSource,
} from '#src/app/app-management/entities/app-source.js'
import type { GitHubInstallationUuid } from '#src/app/github-app/entities/github-installation.uuid.js'
import { generateUuid } from '#src/utils/uuid.js'

export class AppSourceBuilder {
  private readonly source: GitHubAppSource = {
    type: 'github',
    installationUuid: generateUuid<GitHubInstallationUuid>(),
    repo: 'acme/shop',
    branch: 'main',
    rootDir: DEFAULT_ROOT_DIR,
    dockerfilePath: DEFAULT_DOCKERFILE_PATH,
  }

  withInstallationUuid(installationUuid: GitHubInstallationUuid): this {
    this.source.installationUuid = installationUuid
    return this
  }

  withRepo(repo: string): this {
    this.source.repo = repo
    return this
  }

  withBranch(branch: string): this {
    this.source.branch = branch
    return this
  }

  withRootDir(rootDir: string): this {
    this.source.rootDir = rootDir
    return this
  }

  withDockerfilePath(dockerfilePath: string): this {
    this.source.dockerfilePath = dockerfilePath
    return this
  }

  build(): GitHubAppSource {
    return { ...this.source }
  }
}
