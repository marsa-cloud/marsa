import { Module } from '@nestjs/common'

import { StateSigner } from '#src/app/github-app/state-signer.js'
import { ConvertManifestController } from '#src/app/github-app/use-cases/convert-manifest/convert-manifest.controller.js'
import { ConvertManifestUseCase } from '#src/app/github-app/use-cases/convert-manifest/convert-manifest.use-case.js'
import { GitHubClientModule } from '#src/modules/github-client/github-client.module.js'

@Module({
  imports: [GitHubClientModule],
  controllers: [ConvertManifestController],
  providers: [ConvertManifestUseCase, StateSigner],
})
export class ConvertManifestModule {}
