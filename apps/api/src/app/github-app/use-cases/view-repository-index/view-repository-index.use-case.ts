import { BadGatewayException, Injectable, Logger } from '@nestjs/common'
import type { InstallationCredentials } from '#src/app/github-app/queries/installation-credentials.js'
import { ViewRepositoryIndexRepository } from '#src/app/github-app/use-cases/view-repository-index/view-repository-index.repository.js'
import {
  type InstallationRepository,
  ViewRepositoryIndexResponse,
} from '#src/app/github-app/use-cases/view-repository-index/view-repository-index.response.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import { GithubClient } from '#src/modules/github-client/github-client.js'

@Injectable()
export class ViewRepositoryIndexUseCase {
  private readonly logger = new Logger(ViewRepositoryIndexUseCase.name)

  constructor(
    private readonly repository: ViewRepositoryIndexRepository,
    private readonly github: GithubClient,
    private readonly cipher: SecretCipherService,
  ) {}

  async execute(): Promise<ViewRepositoryIndexResponse> {
    const installations = await this.repository.findInstallations()
    const listed = await Promise.all(installations.map((installation) => this.list(installation)))
    if (installations.length > 0 && listed.every((repos) => repos === null)) {
      throw new BadGatewayException('Could not list repositories from GitHub.')
    }
    return new ViewRepositoryIndexResponse(listed.flatMap((repos) => repos ?? []))
  }

  private async list(
    installation: InstallationCredentials,
  ): Promise<InstallationRepository[] | null> {
    try {
      const token = await this.github.getInstallationToken({
        githubAppId: installation.githubAppId,
        privateKeyPem: this.cipher.decrypt(installation.privateKeyPemEnc),
        installationId: installation.installationId,
      })
      const repos = await this.github.listInstallationRepos(token)
      return repos.map((repo) => ({ ...repo, installationUuid: installation.installationUuid }))
    } catch (error) {
      // One uninstalled org must not hide every other account's repos.
      this.logger.warn(
        `listing installation ${installation.installationId} failed: ${(error as Error).message}`,
      )
      return null
    }
  }
}
