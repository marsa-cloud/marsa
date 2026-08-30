import { Module } from '@nestjs/common'
import { UserRoleService } from '#src/app/auth/services/user-role/user-role.service.js'

@Module({
  providers: [UserRoleService],
  exports: [UserRoleService],
})
export class UserRoleModule {}
