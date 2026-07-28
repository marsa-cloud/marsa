import { Module } from '@nestjs/common'
import { ViewMeController } from '#src/app/user/use-cases/view-me/view-me.controller.js'
import { ViewMeRepository } from '#src/app/user/use-cases/view-me/view-me.repository.js'
import { ViewMeUseCase } from '#src/app/user/use-cases/view-me/view-me.use-case.js'

@Module({
  controllers: [ViewMeController],
  providers: [ViewMeUseCase, ViewMeRepository],
})
export class ViewMeModule {}
