import { Module } from '@nestjs/common'
import { AttachDatabaseController } from '#src/app/database-management/use-cases/attach-database/attach-database.controller.js'
import { AttachDatabaseRepository } from '#src/app/database-management/use-cases/attach-database/attach-database.repository.js'
import { AttachDatabaseUseCase } from '#src/app/database-management/use-cases/attach-database/attach-database.use-case.js'
import { PullCredentialsModule } from '#src/modules/pull-credentials/pull-credentials.module.js'

@Module({
  imports: [PullCredentialsModule],
  controllers: [AttachDatabaseController],
  providers: [AttachDatabaseUseCase, AttachDatabaseRepository],
})
export class AttachDatabaseModule {}
