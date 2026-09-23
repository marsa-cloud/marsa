import { Module } from '@nestjs/common'
import { CreateDatabaseModule } from '#src/app/database/use-cases/create-database/create-database.module.js'
import { DeleteDatabaseModule } from '#src/app/database/use-cases/delete-database/delete-database.module.js'
import { ViewDatabaseDetailModule } from '#src/app/database/use-cases/view-database-detail/view-database-detail.module.js'
import { ViewDatabaseIndexModule } from '#src/app/database/use-cases/view-database-index/view-database-index.module.js'

@Module({
  imports: [
    CreateDatabaseModule,
    ViewDatabaseIndexModule,
    ViewDatabaseDetailModule,
    DeleteDatabaseModule,
  ],
})
export class DatabaseFeatureModule {}
