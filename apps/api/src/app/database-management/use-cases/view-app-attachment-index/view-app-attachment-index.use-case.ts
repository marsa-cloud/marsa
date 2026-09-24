import { Injectable, NotFoundException } from '@nestjs/common'
import { ViewAppAttachmentIndexRepository } from '#src/app/database-management/use-cases/view-app-attachment-index/view-app-attachment-index.repository.js'
import { ViewAppAttachmentIndexResponse } from '#src/app/database-management/use-cases/view-app-attachment-index/view-app-attachment-index.response.js'

@Injectable()
export class ViewAppAttachmentIndexUseCase {
  constructor(private readonly repository: ViewAppAttachmentIndexRepository) {}

  async execute(appSlug: string): Promise<ViewAppAttachmentIndexResponse> {
    const app = await this.repository.findAppBySlug(appSlug)
    if (!app) {
      throw new NotFoundException(`App '${appSlug}' was not found.`)
    }

    const attachments = await this.repository.listAttachments(app.uuid)
    return new ViewAppAttachmentIndexResponse(attachments)
  }
}
