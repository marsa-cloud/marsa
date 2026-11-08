import { Module } from '@nestjs/common'
import { DestroyAppRuntimeJobHandler } from '#src/app/app-management/jobs/destroy-app-runtime/destroy-app-runtime.job-handler.js'

@Module({
  providers: [DestroyAppRuntimeJobHandler],
})
export class DestroyAppRuntimeJobModule {}
