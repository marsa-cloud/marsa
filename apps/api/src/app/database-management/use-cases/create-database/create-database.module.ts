import { Module } from '@nestjs/common'
import { CreateDatabaseController } from '#src/app/database-management/use-cases/create-database/create-database.controller.js'
import { CreateDatabaseRepository } from '#src/app/database-management/use-cases/create-database/create-database.repository.js'
import { CreateDatabaseUseCase } from '#src/app/database-management/use-cases/create-database/create-database.use-case.js'

@Module({
  controllers: [CreateDatabaseController],
  providers: [CreateDatabaseUseCase, CreateDatabaseRepository],
})
export class CreateDatabaseModule {}
