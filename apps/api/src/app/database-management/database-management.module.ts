import { Module } from '@nestjs/common'
import { AttachDatabaseModule } from '#src/app/database-management/use-cases/attach-database/attach-database.module.js'
import { CreateDatabaseModule } from '#src/app/database-management/use-cases/create-database/create-database.module.js'
import { DeleteDatabaseModule } from '#src/app/database-management/use-cases/delete-database/delete-database.module.js'
import { DetachDatabaseModule } from '#src/app/database-management/use-cases/detach-database/detach-database.module.js'
import { ViewAppAttachmentIndexModule } from '#src/app/database-management/use-cases/view-app-attachment-index/view-app-attachment-index.module.js'
import { ViewDatabaseDependentIndexModule } from '#src/app/database-management/use-cases/view-database-dependent-index/view-database-dependent-index.module.js'
import { ViewDatabaseDetailModule } from '#src/app/database-management/use-cases/view-database-detail/view-database-detail.module.js'
import { ViewDatabaseIndexModule } from '#src/app/database-management/use-cases/view-database-index/view-database-index.module.js'

@Module({
  imports: [
    CreateDatabaseModule,
    ViewDatabaseIndexModule,
    ViewDatabaseDetailModule,
    DeleteDatabaseModule,
    AttachDatabaseModule,
    DetachDatabaseModule,
    ViewAppAttachmentIndexModule,
    ViewDatabaseDependentIndexModule,
  ],
})
export class DatabaseManagementModule {}
