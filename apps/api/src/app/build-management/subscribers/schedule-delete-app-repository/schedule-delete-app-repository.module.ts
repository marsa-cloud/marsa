import { Module } from '@nestjs/common'
import { ScheduleDeleteAppRepositorySubscriber } from '#src/app/build-management/subscribers/schedule-delete-app-repository/schedule-delete-app-repository.subscriber.js'

@Module({
  providers: [ScheduleDeleteAppRepositorySubscriber],
})
export class ScheduleDeleteAppRepositoryModule {}
