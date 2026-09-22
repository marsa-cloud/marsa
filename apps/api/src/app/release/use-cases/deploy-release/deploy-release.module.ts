import { Module } from '@nestjs/common'
import { DeployReleaseController } from '#src/app/release/use-cases/deploy-release/deploy-release.controller.js'
import { DeployReleaseRepository } from '#src/app/release/use-cases/deploy-release/deploy-release.repository.js'
import { DeployReleaseUseCase } from '#src/app/release/use-cases/deploy-release/deploy-release.use-case.js'

@Module({
  controllers: [DeployReleaseController],
  providers: [DeployReleaseUseCase, DeployReleaseRepository],
})
export class DeployReleaseModule {}
