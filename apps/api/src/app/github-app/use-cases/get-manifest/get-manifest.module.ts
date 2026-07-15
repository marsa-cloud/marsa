import { Module } from '@nestjs/common'
import { ManifestStateModule } from '#src/app/github-app/manifest-state/manifest-state.module.js'
import { GetManifestController } from '#src/app/github-app/use-cases/get-manifest/get-manifest.controller.js'
import { GetManifestUseCase } from '#src/app/github-app/use-cases/get-manifest/get-manifest.use-case.js'

@Module({
  imports: [ManifestStateModule],
  controllers: [GetManifestController],
  providers: [GetManifestUseCase],
})
export class GetManifestModule {}
