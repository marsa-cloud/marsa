import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { GithubClient } from '#src/modules/github-client/github-client.js'
import { MockGithubClient } from '#src/modules/github-client/mock-github-client.js'
import { OctokitGithubClient } from '#src/modules/github-client/octokit-github-client.js'

@Module({
  providers: [
    {
      provide: GithubClient,
      useFactory: (config: ConfigService) =>
        config.getOrThrow('NODE_ENV') === 'test'
          ? new MockGithubClient()
          : new OctokitGithubClient(),
      inject: [ConfigService],
    },
  ],
  exports: [GithubClient],
})
export class GitHubClientModule {}
