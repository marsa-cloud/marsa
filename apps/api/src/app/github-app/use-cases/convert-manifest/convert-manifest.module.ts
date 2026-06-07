import { Module } from '@nestjs/common'

import { GitHubAppSharedModule } from '#src/app/github-app/github-app-shared.module.js'
import { ConvertManifestController } from '#src/app/github-app/use-cases/convert-manifest/convert-manifest.controller.js'
import { ConvertManifestService } from '#src/app/github-app/use-cases/convert-manifest/convert-manifest.service.js'

@Module({
  imports: [GitHubAppSharedModule],
  controllers: [ConvertManifestController],
  providers: [ConvertManifestService],
})
export class ConvertManifestModule {}
