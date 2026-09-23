import { Module } from '@nestjs/common'
import { CompleteBuildRepository } from '#src/app/build/use-cases/complete-build/complete-build.repository.js'
import { CompleteBuildUseCase } from '#src/app/build/use-cases/complete-build/complete-build.use-case.js'

@Module({
  providers: [CompleteBuildUseCase, CompleteBuildRepository],
  exports: [CompleteBuildUseCase],
})
export class CompleteBuildModule {}
