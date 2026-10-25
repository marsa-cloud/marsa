import { Module } from '@nestjs/common'
import { PullCredentials } from '#src/modules/pull-credentials/pull-credentials.service.js'

@Module({
  providers: [PullCredentials],
  exports: [PullCredentials],
})
export class PullCredentialsModule {}
