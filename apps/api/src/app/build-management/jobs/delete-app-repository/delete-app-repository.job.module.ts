import { Module } from '@nestjs/common'
import { DeleteAppRepositoryJobHandler } from '#src/app/build-management/jobs/delete-app-repository/delete-app-repository.job-handler.js'

@Module({
  providers: [DeleteAppRepositoryJobHandler],
})
export class DeleteAppRepositoryJobModule {}
