import { Module } from '@nestjs/common'
import { CaptureInstallationModule } from '#src/app/github-app/use-cases/capture-installation/capture-installation.module.js'
import { ConvertManifestModule } from '#src/app/github-app/use-cases/convert-manifest/convert-manifest.module.js'
import { GetManifestModule } from '#src/app/github-app/use-cases/get-manifest/get-manifest.module.js'
import { ViewRepositoryIndexModule } from '#src/app/github-app/use-cases/view-repository-index/view-repository-index.module.js'

@Module({
  imports: [
    GetManifestModule,
    ConvertManifestModule,
    CaptureInstallationModule,
    ViewRepositoryIndexModule,
  ],
})
export class GitHubAppModule {}
