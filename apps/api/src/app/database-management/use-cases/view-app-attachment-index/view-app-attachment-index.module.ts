import { Module } from '@nestjs/common'
import { ViewAppAttachmentIndexController } from '#src/app/database-management/use-cases/view-app-attachment-index/view-app-attachment-index.controller.js'
import { ViewAppAttachmentIndexRepository } from '#src/app/database-management/use-cases/view-app-attachment-index/view-app-attachment-index.repository.js'
import { ViewAppAttachmentIndexUseCase } from '#src/app/database-management/use-cases/view-app-attachment-index/view-app-attachment-index.use-case.js'

@Module({
  controllers: [ViewAppAttachmentIndexController],
  providers: [ViewAppAttachmentIndexUseCase, ViewAppAttachmentIndexRepository],
})
export class ViewAppAttachmentIndexModule {}
