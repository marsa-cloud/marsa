import { BadGatewayException, Injectable } from '@nestjs/common'
import type { InstallationCredentials } from '#src/app/github-app/queries/installation-credentials.js'
import { ViewRepositoryIndexRepository } from '#src/app/github-app/use-cases/view-repository-index/view-repository-index.repository.js'
import { ViewRepositoryIndexResponse } from '#src/app/github-app/use-cases/view-repository-index/view-repository-index.response.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import { GithubClient } from '#src/modules/github-client/github-client.js'
import type { GitHubRepository } from '#src/modules/github-client/github-client.types.js'

@Injectable()
export class ViewRepositoryIndexUseCase {
  constructor(
    private readonly repository: ViewRepositoryIndexRepository,
    private readonly github: GithubClient,
    private readonly cipher: SecretCipherService,
  ) {}

  async execute(): Promise<ViewRepositoryIndexResponse> {
    const installation = await this.repository.findInstallation()
    if (!installation) {
      return new ViewRepositoryIndexResponse([])
    }
    const repos = await this.list(installation)
    return new ViewRepositoryIndexResponse(
      repos.map((repo) => ({ ...repo, installationUuid: installation.installationUuid })),
    )
  }

  private async list(installation: InstallationCredentials): Promise<GitHubRepository[]> {
    try {
      const token = await this.github.getInstallationToken({
        githubAppId: installation.githubAppId,
        privateKeyPem: this.cipher.decrypt(installation.privateKeyPemEnc),
        installationId: installation.installationId,
      })
      return await this.github.listInstallationRepos(token)
    } catch (error) {
      throw new BadGatewayException('Could not list repositories from GitHub.', { cause: error })
    }
  }
}
