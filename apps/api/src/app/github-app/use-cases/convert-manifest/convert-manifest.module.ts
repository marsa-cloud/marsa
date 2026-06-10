import { Module } from '@nestjs/common'

import { ManifestStateModule } from '#src/app/github-app/manifest-state/manifest-state.module.js'
import { ConvertManifestController } from '#src/app/github-app/use-cases/convert-manifest/convert-manifest.controller.js'
import { ConvertManifestUseCase } from '#src/app/github-app/use-cases/convert-manifest/convert-manifest.use-case.js'
import { GitHubClientModule } from '#src/modules/github-client/github-client.module.js'

@Module({
  imports: [GitHubClientModule, ManifestStateModule],
  controllers: [ConvertManifestController],
  providers: [ConvertManifestUseCase],
})
export class ConvertManifestModule {}
