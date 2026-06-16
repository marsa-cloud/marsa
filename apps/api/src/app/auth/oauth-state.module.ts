import { Module } from '@nestjs/common'

import { OAuthStateService } from '#src/app/auth/oauth-state.service.js'

@Module({
  providers: [OAuthStateService],
  exports: [OAuthStateService],
})
export class OAuthStateModule {}
