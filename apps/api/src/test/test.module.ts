import { type DynamicModule, type MiddlewareConsumer, Module, type Type } from '@nestjs/common'
import { DatabaseModule } from '#src/modules/database/database.module.js'
import { DomainEventsModule } from '#src/modules/domain-events/domain-events.module.js'
import { JobQueueModule } from '#src/modules/jobs/job-queue.module.js'

@Module({})
export class TestModule {
  static forRoot(
    modules: Array<DynamicModule | Type<unknown>> = [],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _migrationsRun = false,
  ): DynamicModule {
    return {
      module: TestModule,
      imports: [DatabaseModule, JobQueueModule, DomainEventsModule, ...modules],
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  configure(_consumer: MiddlewareConsumer) {
    // TODO: add auth middleware
  }
}
