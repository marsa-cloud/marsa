import { Module } from '@nestjs/common'
import { ViewDatabaseDetailController } from '#src/app/database-management/use-cases/view-database-detail/view-database-detail.controller.js'
import { ViewDatabaseDetailRepository } from '#src/app/database-management/use-cases/view-database-detail/view-database-detail.repository.js'
import { ViewDatabaseDetailUseCase } from '#src/app/database-management/use-cases/view-database-detail/view-database-detail.use-case.js'

@Module({
  controllers: [ViewDatabaseDetailController],
  providers: [ViewDatabaseDetailUseCase, ViewDatabaseDetailRepository],
})
export class ViewDatabaseDetailModule {}
