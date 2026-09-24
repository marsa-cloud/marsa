import { Module } from '@nestjs/common'
import { ViewDatabaseDependentIndexController } from '#src/app/database-management/use-cases/view-database-dependent-index/view-database-dependent-index.controller.js'
import { ViewDatabaseDependentIndexRepository } from '#src/app/database-management/use-cases/view-database-dependent-index/view-database-dependent-index.repository.js'
import { ViewDatabaseDependentIndexUseCase } from '#src/app/database-management/use-cases/view-database-dependent-index/view-database-dependent-index.use-case.js'

@Module({
  controllers: [ViewDatabaseDependentIndexController],
  providers: [ViewDatabaseDependentIndexUseCase, ViewDatabaseDependentIndexRepository],
})
export class ViewDatabaseDependentIndexModule {}
