import { Module } from '@nestjs/common'

import { GetCurrentOperatorController } from '#src/app/auth/use-cases/get-current-operator/get-current-operator.controller.js'
import { GetCurrentOperatorRepository } from '#src/app/auth/use-cases/get-current-operator/get-current-operator.repository.js'
import { GetCurrentOperatorUseCase } from '#src/app/auth/use-cases/get-current-operator/get-current-operator.use-case.js'

@Module({
  controllers: [GetCurrentOperatorController],
  providers: [GetCurrentOperatorUseCase, GetCurrentOperatorRepository],
})
export class GetCurrentOperatorModule {}
