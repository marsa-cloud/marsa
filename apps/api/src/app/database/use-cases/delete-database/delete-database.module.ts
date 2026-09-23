import { Module } from '@nestjs/common'
import { DeleteDatabaseController } from '#src/app/database/use-cases/delete-database/delete-database.controller.js'
import { DeleteDatabaseRepository } from '#src/app/database/use-cases/delete-database/delete-database.repository.js'
import { DeleteDatabaseUseCase } from '#src/app/database/use-cases/delete-database/delete-database.use-case.js'

@Module({
  controllers: [DeleteDatabaseController],
  providers: [DeleteDatabaseUseCase, DeleteDatabaseRepository],
})
export class DeleteDatabaseModule {}
