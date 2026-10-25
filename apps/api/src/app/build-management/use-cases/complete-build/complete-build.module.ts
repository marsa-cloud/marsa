import { Module } from '@nestjs/common'
import { CompleteBuildRepository } from '#src/app/build-management/use-cases/complete-build/complete-build.repository.js'
import { CompleteBuildUseCase } from '#src/app/build-management/use-cases/complete-build/complete-build.use-case.js'
import { ReleasePullCredentialsModule } from '#src/app/release/services/release-pull-credentials/release-pull-credentials.module.js'

@Module({
  imports: [ReleasePullCredentialsModule],
  providers: [CompleteBuildUseCase, CompleteBuildRepository],
  exports: [CompleteBuildUseCase],
})
export class CompleteBuildModule {}
