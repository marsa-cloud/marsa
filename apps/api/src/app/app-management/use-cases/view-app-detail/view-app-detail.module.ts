import { Module } from '@nestjs/common'
import { ViewAppDetailController } from '#src/app/app-management/use-cases/view-app-detail/view-app-detail.controller.js'
import { ViewAppDetailRepository } from '#src/app/app-management/use-cases/view-app-detail/view-app-detail.repository.js'
import { ViewAppDetailUseCase } from '#src/app/app-management/use-cases/view-app-detail/view-app-detail.use-case.js'

@Module({
  controllers: [ViewAppDetailController],
  providers: [ViewAppDetailUseCase, ViewAppDetailRepository],
})
export class ViewAppDetailModule {}
