import { Module } from '@nestjs/common'
import { DetachDatabaseController } from '#src/app/database-management/use-cases/detach-database/detach-database.controller.js'
import { DetachDatabaseRepository } from '#src/app/database-management/use-cases/detach-database/detach-database.repository.js'
import { DetachDatabaseUseCase } from '#src/app/database-management/use-cases/detach-database/detach-database.use-case.js'
import { PullCredentialsModule } from '#src/modules/pull-credentials/pull-credentials.module.js'

@Module({
  imports: [PullCredentialsModule],
  controllers: [DetachDatabaseController],
  providers: [DetachDatabaseUseCase, DetachDatabaseRepository],
})
export class DetachDatabaseModule {}
