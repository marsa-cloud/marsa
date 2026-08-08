import { Module } from '@nestjs/common'
import { UpdateAppEnvController } from '#src/app/app-management/use-cases/update-app-env/update-app-env.controller.js'
import { UpdateAppEnvRepository } from '#src/app/app-management/use-cases/update-app-env/update-app-env.repository.js'
import { UpdateAppEnvUseCase } from '#src/app/app-management/use-cases/update-app-env/update-app-env.use-case.js'

@Module({
  controllers: [UpdateAppEnvController],
  providers: [UpdateAppEnvUseCase, UpdateAppEnvRepository],
})
export class UpdateAppEnvModule {}
