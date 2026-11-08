import { Module } from '@nestjs/common'
import { ScheduleCancelAppBuildsSubscriber } from '#src/app/build-management/subscribers/schedule-cancel-app-builds/schedule-cancel-app-builds.subscriber.js'

@Module({
  providers: [ScheduleCancelAppBuildsSubscriber],
})
export class ScheduleCancelAppBuildsModule {}
