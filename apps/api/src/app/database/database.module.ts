import { Module } from '@nestjs/common'
import { CreateDatabaseModule } from '#src/app/database/use-cases/create-database/create-database.module.js'

@Module({
  imports: [CreateDatabaseModule],
})
export class DatabaseFeatureModule {}
