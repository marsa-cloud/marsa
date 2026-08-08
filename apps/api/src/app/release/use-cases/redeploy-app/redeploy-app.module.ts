import { Module } from '@nestjs/common'
import { ApplyReleaseModule } from '#src/app/release/services/apply-release/apply-release.module.js'
import { RedeployAppController } from '#src/app/release/use-cases/redeploy-app/redeploy-app.controller.js'
import { RedeployAppRepository } from '#src/app/release/use-cases/redeploy-app/redeploy-app.repository.js'
import { RedeployAppUseCase } from '#src/app/release/use-cases/redeploy-app/redeploy-app.use-case.js'

@Module({
  imports: [ApplyReleaseModule],
  controllers: [RedeployAppController],
  providers: [RedeployAppUseCase, RedeployAppRepository],
})
export class RedeployAppModule {}
