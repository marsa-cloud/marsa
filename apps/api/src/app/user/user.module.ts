import { Module } from '@nestjs/common'
import { ViewMeModule } from '#src/app/user/use-cases/view-me/view-me.module.js'

@Module({
  imports: [ViewMeModule],
})
export class UserModule {}
