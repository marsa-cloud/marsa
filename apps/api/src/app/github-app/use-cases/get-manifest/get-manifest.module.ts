import { Module } from '@nestjs/common'

import { GitHubAppSharedModule } from '#src/app/github-app/github-app-shared.module.js'
import { GetManifestController } from '#src/app/github-app/use-cases/get-manifest/get-manifest.controller.js'
import { GetManifestService } from '#src/app/github-app/use-cases/get-manifest/get-manifest.service.js'

@Module({
  imports: [GitHubAppSharedModule],
  controllers: [GetManifestController],
  providers: [GetManifestService],
})
export class GetManifestModule {}
