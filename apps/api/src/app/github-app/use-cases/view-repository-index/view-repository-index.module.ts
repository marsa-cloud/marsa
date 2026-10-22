import { Module } from '@nestjs/common'
import { ViewRepositoryIndexController } from '#src/app/github-app/use-cases/view-repository-index/view-repository-index.controller.js'
import { ViewRepositoryIndexRepository } from '#src/app/github-app/use-cases/view-repository-index/view-repository-index.repository.js'
import { ViewRepositoryIndexUseCase } from '#src/app/github-app/use-cases/view-repository-index/view-repository-index.use-case.js'
import { GitHubClientModule } from '#src/modules/github-client/github-client.module.js'

@Module({
  imports: [GitHubClientModule],
  controllers: [ViewRepositoryIndexController],
  providers: [ViewRepositoryIndexUseCase, ViewRepositoryIndexRepository],
})
export class ViewRepositoryIndexModule {}
