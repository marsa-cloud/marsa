import { Global, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DiscoveryModule } from '@nestjs/core'
import { JobQueueLifecycle } from '#src/modules/jobs/job-queue.lifecycle.js'
import { PG_BOSS } from '#src/modules/jobs/job-queue.tokens.js'
import { JobRegistry } from '#src/modules/jobs/job-registry.js'
import { JobScheduler } from '#src/modules/jobs/job-scheduler.js'
import { createPgBoss } from '#src/modules/jobs/pg-boss.factory.js'

@Global()
@Module({
  imports: [DiscoveryModule],
  providers: [
    { provide: PG_BOSS, inject: [ConfigService], useFactory: createPgBoss },
    JobRegistry,
    JobScheduler,
    JobQueueLifecycle,
  ],
  exports: [PG_BOSS, JobRegistry, JobScheduler],
})
export class JobQueueModule {}
