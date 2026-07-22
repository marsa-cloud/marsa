import { Module } from '@nestjs/common'
import { DeployAppModule } from '#src/app/release/use-cases/deploy-app/deploy-app.module.js'
import { ViewReleaseIndexModule } from '#src/app/release/use-cases/view-release-index/view-release-index.module.js'

@Module({
  imports: [DeployAppModule, ViewReleaseIndexModule],
})
export class ReleaseModule {}
