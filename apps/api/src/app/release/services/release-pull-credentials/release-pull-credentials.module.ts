import { Module } from '@nestjs/common'
import { ReleasePullCredentials } from '#src/app/release/services/release-pull-credentials/release-pull-credentials.service.js'

@Module({
  providers: [ReleasePullCredentials],
  exports: [ReleasePullCredentials],
})
export class ReleasePullCredentialsModule {}
