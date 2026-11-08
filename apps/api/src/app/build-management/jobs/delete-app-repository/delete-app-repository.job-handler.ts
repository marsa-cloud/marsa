import { Injectable } from '@nestjs/common'
import { AppImagesDeletedDomainEvent } from '#src/app/app-management/events/app-images-deleted.event.js'
import type { AppDeletedPayload } from '#src/app/app-management/queries/app-deletion.js'
import { DeleteAppRepositoryJob } from '#src/app/build-management/jobs/delete-app-repository/delete-app-repository.job.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'
import { DomainEventEmitter } from '#src/modules/domain-events/domain-event-emitter.js'
import { JobHandler, type JobHandlerInstance } from '#src/modules/jobs/job-handler.decorator.js'
import { ImageRegistry } from '#src/modules/runtime/image-registry.js'

@Injectable()
@JobHandler(DeleteAppRepositoryJob)
export class DeleteAppRepositoryJobHandler implements JobHandlerInstance<AppDeletedPayload> {
  constructor(
    private readonly imageRegistry: ImageRegistry,
    @InjectDatabase() private readonly db: Database,
    private readonly emitter: DomainEventEmitter,
  ) {}

  async handle(payload: AppDeletedPayload): Promise<void> {
    await this.imageRegistry.deleteRepository(payload.slug)
    await this.db.transaction((tx) =>
      this.emitter.emit(tx, [new AppImagesDeletedDomainEvent(payload)]),
    )
  }
}
