import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'

import { githubAppConfig } from '#src/app/github-app/github-app.config.js'
import { StateSigner } from '#src/app/github-app/state-signer.js'
import { GetManifestController } from '#src/app/github-app/use-cases/get-manifest/get-manifest.controller.js'
import { GetManifestUseCase } from '#src/app/github-app/use-cases/get-manifest/get-manifest.use-case.js'

@Module({
  imports: [ConfigModule.forFeature(githubAppConfig)],
  controllers: [GetManifestController],
  providers: [GetManifestUseCase, StateSigner],
})
export class GetManifestModule {}
