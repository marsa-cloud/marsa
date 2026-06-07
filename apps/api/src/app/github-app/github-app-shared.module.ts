import { Module } from '@nestjs/common'

import { GitHubAppConfig } from '#src/app/github-app/github-app.config.js'
import { GitHubManifestClient } from '#src/app/github-app/github-manifest.client.js'
import { StateSigner } from '#src/app/github-app/state-signer.js'

/** Shared providers used across the github-app use-cases. */
@Module({
  providers: [GitHubAppConfig, StateSigner, GitHubManifestClient],
  exports: [GitHubAppConfig, StateSigner, GitHubManifestClient],
})
export class GitHubAppSharedModule {}
