import { Module } from '@nestjs/common'
import { CreateReleaseModule } from '#src/app/release/use-cases/create-release/create-release.module.js'
import { DeployAppModule } from '#src/app/release/use-cases/deploy-app/deploy-app.module.js'
import { RedeployAppModule } from '#src/app/release/use-cases/redeploy-app/redeploy-app.module.js'
import { ViewReleaseIndexModule } from '#src/app/release/use-cases/view-release-index/view-release-index.module.js'

@Module({
  imports: [CreateReleaseModule, DeployAppModule, RedeployAppModule, ViewReleaseIndexModule],
})
export class ReleaseModule {}
