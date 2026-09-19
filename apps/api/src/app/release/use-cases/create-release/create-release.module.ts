import { Module } from '@nestjs/common'
import { CreateReleaseController } from '#src/app/release/use-cases/create-release/create-release.controller.js'
import { CreateReleaseRepository } from '#src/app/release/use-cases/create-release/create-release.repository.js'
import { CreateReleaseUseCase } from '#src/app/release/use-cases/create-release/create-release.use-case.js'

@Module({
  controllers: [CreateReleaseController],
  providers: [CreateReleaseUseCase, CreateReleaseRepository],
})
export class CreateReleaseModule {}
