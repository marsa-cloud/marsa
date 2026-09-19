import { Module } from '@nestjs/common'
import { ApplyReleaseModule } from '#src/app/release/services/apply-release/apply-release.module.js'
import { DeployReleaseController } from '#src/app/release/use-cases/deploy-release/deploy-release.controller.js'
import { DeployReleaseRepository } from '#src/app/release/use-cases/deploy-release/deploy-release.repository.js'
import { DeployReleaseUseCase } from '#src/app/release/use-cases/deploy-release/deploy-release.use-case.js'

@Module({
  imports: [ApplyReleaseModule],
  controllers: [DeployReleaseController],
  providers: [DeployReleaseUseCase, DeployReleaseRepository],
})
export class DeployReleaseModule {}
