import { Module } from '@nestjs/common'
import { CompleteBuildRepository } from '#src/app/build-management/use-cases/complete-build/complete-build.repository.js'
import { CompleteBuildUseCase } from '#src/app/build-management/use-cases/complete-build/complete-build.use-case.js'
import { PullCredentialsModule } from '#src/modules/pull-credentials/pull-credentials.module.js'

@Module({
  imports: [PullCredentialsModule],
  providers: [CompleteBuildUseCase, CompleteBuildRepository],
  exports: [CompleteBuildUseCase],
})
export class CompleteBuildModule {}
