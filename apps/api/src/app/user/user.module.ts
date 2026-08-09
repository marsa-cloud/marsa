import { Module } from '@nestjs/common'
import { UpdateUserRoleModule } from '#src/app/user/use-cases/update-user-role/update-user-role.module.js'
import { ViewMeModule } from '#src/app/user/use-cases/view-me/view-me.module.js'
import { ViewUserIndexModule } from '#src/app/user/use-cases/view-user-index/view-user-index.module.js'

@Module({
  imports: [ViewMeModule, ViewUserIndexModule, UpdateUserRoleModule],
})
export class UserModule {}
