import { Module } from '@nestjs/common'
import { GetCurrentUserController } from '#src/app/user/use-cases/get-current-user/get-current-user.controller.js'
import { GetCurrentUserRepository } from '#src/app/user/use-cases/get-current-user/get-current-user.repository.js'
import { GetCurrentUserUseCase } from '#src/app/user/use-cases/get-current-user/get-current-user.use-case.js'

@Module({
  controllers: [GetCurrentUserController],
  providers: [GetCurrentUserUseCase, GetCurrentUserRepository],
})
export class GetCurrentUserModule {}
