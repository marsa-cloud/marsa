import { Module } from '@nestjs/common'
import { ScheduleFinalizeAppDeletionSubscriber } from '#src/app/app-management/subscribers/schedule-finalize-app-deletion/schedule-finalize-app-deletion.subscriber.js'

@Module({
  providers: [ScheduleFinalizeAppDeletionSubscriber],
})
export class ScheduleFinalizeAppDeletionModule {}
