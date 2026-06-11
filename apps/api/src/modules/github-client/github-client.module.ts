import { Module } from '@nestjs/common'

import { GitHubManifestClient } from '#src/modules/github-client/github-manifest.client.js'

/**
 * Support module for talking to GitHub's API. Currently exposes the manifest
 * conversion client; future GitHub API access (octokit, #23) lands here too.
 */
@Module({
  providers: [GitHubManifestClient],
  exports: [GitHubManifestClient],
})
export class GitHubClientModule {}
