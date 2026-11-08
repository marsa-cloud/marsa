import { Module } from '@nestjs/common'
import { ScheduleDestroyAppRuntimeSubscriber } from '#src/app/app-management/subscribers/schedule-destroy-app-runtime/schedule-destroy-app-runtime.subscriber.js'

@Module({
  providers: [ScheduleDestroyAppRuntimeSubscriber],
})
export class ScheduleDestroyAppRuntimeModule {}
