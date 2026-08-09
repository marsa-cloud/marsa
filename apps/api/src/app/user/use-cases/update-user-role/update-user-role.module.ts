import { Module } from '@nestjs/common'
import { UpdateUserRoleController } from '#src/app/user/use-cases/update-user-role/update-user-role.controller.js'
import { UpdateUserRoleRepository } from '#src/app/user/use-cases/update-user-role/update-user-role.repository.js'
import { UpdateUserRoleUseCase } from '#src/app/user/use-cases/update-user-role/update-user-role.use-case.js'

@Module({
  controllers: [UpdateUserRoleController],
  providers: [UpdateUserRoleUseCase, UpdateUserRoleRepository],
})
export class UpdateUserRoleModule {}
