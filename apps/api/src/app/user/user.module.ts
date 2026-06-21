import { Module } from '@nestjs/common'

import { GetCurrentUserModule } from '#src/app/user/use-cases/get-current-user/get-current-user.module.js'

@Module({
  imports: [GetCurrentUserModule],
})
export class UserModule {}
