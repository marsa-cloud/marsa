import { Module } from '@nestjs/common'

import { GitHubInstallationTokenService } from '#src/modules/github-client/github-installation-token.service.js'
import { GitHubManifestClient } from '#src/modules/github-client/github-manifest.client.js'

/**
 * Support module for talking to GitHub's API. Exposes the manifest conversion
 * client and the installation-token service (octokit, #59); future GitHub API
 * access lands here too.
 */
@Module({
  providers: [GitHubManifestClient, GitHubInstallationTokenService],
  exports: [GitHubManifestClient, GitHubInstallationTokenService],
})
export class GitHubClientModule {}
