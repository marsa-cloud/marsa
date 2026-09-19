import { Module } from '@nestjs/common'
import { CreateReleaseModule } from '#src/app/release/use-cases/create-release/create-release.module.js'
import { DeployReleaseModule } from '#src/app/release/use-cases/deploy-release/deploy-release.module.js'
import { ViewReleaseIndexModule } from '#src/app/release/use-cases/view-release-index/view-release-index.module.js'

@Module({
  imports: [CreateReleaseModule, DeployReleaseModule, ViewReleaseIndexModule],
})
export class ReleaseModule {}
