import { Module } from '@nestjs/common'
import { CreateDatabaseModule } from '#src/app/database/use-cases/create-database/create-database.module.js'
import { DeleteDatabaseModule } from '#src/app/database/use-cases/delete-database/delete-database.module.js'

@Module({
  imports: [CreateDatabaseModule, DeleteDatabaseModule],
})
export class DatabaseFeatureModule {}
