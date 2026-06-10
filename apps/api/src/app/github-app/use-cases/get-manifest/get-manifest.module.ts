import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'

import { githubAppConfig } from '#src/app/github-app/github-app.config.js'
import { ManifestStateModule } from '#src/app/github-app/manifest-state/manifest-state.module.js'
import { GetManifestController } from '#src/app/github-app/use-cases/get-manifest/get-manifest.controller.js'
import { GetManifestUseCase } from '#src/app/github-app/use-cases/get-manifest/get-manifest.use-case.js'

@Module({
  imports: [ConfigModule.forFeature(githubAppConfig), ManifestStateModule],
  controllers: [GetManifestController],
  providers: [GetManifestUseCase],
})
export class GetManifestModule {}
