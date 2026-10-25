import { Module } from '@nestjs/common'
import { AttachDatabaseController } from '#src/app/database-management/use-cases/attach-database/attach-database.controller.js'
import { AttachDatabaseRepository } from '#src/app/database-management/use-cases/attach-database/attach-database.repository.js'
import { AttachDatabaseUseCase } from '#src/app/database-management/use-cases/attach-database/attach-database.use-case.js'
import { ReleasePullCredentialsModule } from '#src/app/release/services/release-pull-credentials/release-pull-credentials.module.js'

@Module({
  imports: [ReleasePullCredentialsModule],
  controllers: [AttachDatabaseController],
  providers: [AttachDatabaseUseCase, AttachDatabaseRepository],
})
export class AttachDatabaseModule {}
