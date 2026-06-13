import { Module } from '@nestjs/common'

import { GithubClient } from '#src/modules/github-client/github-client.js'
import { MockGithubClient } from '#src/modules/github-client/mock-github-client.js'
import { OctokitGithubClient } from '#src/modules/github-client/octokit-github-client.js'

/**
 * Binds the `GithubClient` seam to a concrete implementation (AgDR-0014). The
 * network-free `MockGithubClient` is used under `NODE_ENV=test` (so e2e/local
 * never hit GitHub) or when `GITHUB_CLIENT_MOCK=true` is set for local dev;
 * everything else gets the real `OctokitGithubClient`.
 */
function useMockGithubClient(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.GITHUB_CLIENT_MOCK === 'true'
}

@Module({
  providers: [
    {
      provide: GithubClient,
      useClass: useMockGithubClient() ? MockGithubClient : OctokitGithubClient,
    },
  ],
  exports: [GithubClient],
})
export class GitHubClientModule {}
