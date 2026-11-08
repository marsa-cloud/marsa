import { Injectable } from '@nestjs/common'
import { AppRuntimeDestroyedDomainEvent } from '#src/app/app-management/events/app-runtime-destroyed.event.js'
import { DestroyAppRuntimeJob } from '#src/app/app-management/jobs/destroy-app-runtime/destroy-app-runtime.job.js'
import type { AppDeletedPayload } from '#src/app/app-management/queries/app-deletion.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'
import { DomainEventEmitter } from '#src/modules/domain-events/domain-event-emitter.js'
import { JobHandler, type JobHandlerInstance } from '#src/modules/jobs/job-handler.decorator.js'
import { AppRuntime } from '#src/modules/runtime/app-runtime.js'

@Injectable()
@JobHandler(DestroyAppRuntimeJob)
export class DestroyAppRuntimeJobHandler implements JobHandlerInstance<AppDeletedPayload> {
  constructor(
    private readonly appRuntime: AppRuntime,
    @InjectDatabase() private readonly db: Database,
    private readonly emitter: DomainEventEmitter,
  ) {}

  async handle(payload: AppDeletedPayload): Promise<void> {
    await this.appRuntime.destroy(payload.placement)
    await this.db.transaction((tx) =>
      this.emitter.emit(tx, [new AppRuntimeDestroyedDomainEvent(payload)]),
    )
  }
}
