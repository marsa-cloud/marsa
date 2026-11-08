import { Injectable } from '@nestjs/common'
import type { AppDeletedPayload } from '#src/app/app-management/queries/app-deletion.js'
import { buildRefOf } from '#src/app/build-management/entities/build-ref.js'
import { AppBuildsCancelledDomainEvent } from '#src/app/build-management/events/app-builds-cancelled.event.js'
import { CancelAppBuildsJob } from '#src/app/build-management/jobs/cancel-app-builds/cancel-app-builds.job.js'
import { CancelAppBuildsRepository } from '#src/app/build-management/jobs/cancel-app-builds/cancel-app-builds.repository.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'
import { DomainEventEmitter } from '#src/modules/domain-events/domain-event-emitter.js'
import { JobHandler, type JobHandlerInstance } from '#src/modules/jobs/job-handler.decorator.js'
import { BuildRuntime } from '#src/modules/runtime/build-runtime.js'

@Injectable()
@JobHandler(CancelAppBuildsJob)
export class CancelAppBuildsJobHandler implements JobHandlerInstance<AppDeletedPayload> {
  constructor(
    private readonly buildRuntime: BuildRuntime,
    @InjectDatabase() private readonly db: Database,
    private readonly repository: CancelAppBuildsRepository,
    private readonly emitter: DomainEventEmitter,
  ) {}

  async handle(payload: AppDeletedPayload): Promise<void> {
    const running = await this.repository.findRunning(this.db, payload.appUuid)
    for (const build of running) {
      await this.buildRuntime.cancel(buildRefOf(payload.slug, build.uuid))
    }
    await this.db.transaction(async (tx) => {
      for (const build of running) await this.repository.markCancelled(tx, build.uuid)
      await this.emitter.emit(tx, [new AppBuildsCancelledDomainEvent(payload)])
    })
  }
}
