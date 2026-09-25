import { Module } from '@nestjs/common'
import { ViewDatabaseIndexController } from '#src/app/database-management/use-cases/view-database-index/view-database-index.controller.js'
import { ViewDatabaseIndexRepository } from '#src/app/database-management/use-cases/view-database-index/view-database-index.repository.js'
import { ViewDatabaseIndexUseCase } from '#src/app/database-management/use-cases/view-database-index/view-database-index.use-case.js'

@Module({
  controllers: [ViewDatabaseIndexController],
  providers: [ViewDatabaseIndexUseCase, ViewDatabaseIndexRepository],
})
export class ViewDatabaseIndexModule {}
