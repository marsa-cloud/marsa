import { Module } from '@nestjs/common'
import { ApplyReleaseModule } from '#src/app/release/services/apply-release/apply-release.module.js'
import { DeployAppController } from '#src/app/release/use-cases/deploy-app/deploy-app.controller.js'
import { DeployAppRepository } from '#src/app/release/use-cases/deploy-app/deploy-app.repository.js'
import { DeployAppUseCase } from '#src/app/release/use-cases/deploy-app/deploy-app.use-case.js'

@Module({
  imports: [ApplyReleaseModule],
  controllers: [DeployAppController],
  providers: [DeployAppUseCase, DeployAppRepository],
})
export class DeployAppModule {}
