import { Module } from '@nestjs/common'
import { CancelAppBuildsJobHandler } from '#src/app/build-management/jobs/cancel-app-builds/cancel-app-builds.job-handler.js'
import { CancelAppBuildsRepository } from '#src/app/build-management/jobs/cancel-app-builds/cancel-app-builds.repository.js'

@Module({
  providers: [CancelAppBuildsJobHandler, CancelAppBuildsRepository],
})
export class CancelAppBuildsJobModule {}
