import { ApiProperty } from '@nestjs/swagger'
import type { GitHubInstallationUuid } from '#src/app/github-app/entities/github-installation.uuid.js'
import type { GitHubRepository } from '#src/modules/github-client/github-client.types.js'

export interface InstallationRepository extends GitHubRepository {
  installationUuid: GitHubInstallationUuid
}

export class GitHubRepositorySummary {
  @ApiProperty({ type: String, format: 'uuid', description: 'Installation that can read it.' })
  readonly installationUuid: string

  @ApiProperty({ type: String, example: 'acme/shop' })
  readonly fullName: string

  @ApiProperty({ type: String, example: 'main' })
  readonly defaultBranch: string

  @ApiProperty({ type: Boolean })
  readonly private: boolean

  constructor(repo: InstallationRepository) {
    this.installationUuid = repo.installationUuid
    this.fullName = repo.fullName
    this.defaultBranch = repo.defaultBranch
    this.private = repo.private
  }
}

export class ViewRepositoryIndexResponse {
  @ApiProperty({ type: [GitHubRepositorySummary] })
  readonly items: GitHubRepositorySummary[]

  constructor(repos: InstallationRepository[]) {
    this.items = [...repos]
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
      .map((repo) => new GitHubRepositorySummary(repo))
  }
}
