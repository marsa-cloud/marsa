import { Module } from '@nestjs/common'
import { ViewUserIndexController } from '#src/app/user/use-cases/view-user-index/view-user-index.controller.js'
import { ViewUserIndexRepository } from '#src/app/user/use-cases/view-user-index/view-user-index.repository.js'
import { ViewUserIndexUseCase } from '#src/app/user/use-cases/view-user-index/view-user-index.use-case.js'

@Module({
  controllers: [ViewUserIndexController],
  providers: [ViewUserIndexUseCase, ViewUserIndexRepository],
})
export class ViewUserIndexModule {}
