import { Module } from '@nestjs/common'
import { UpdateAppController } from '#src/app/app-management/use-cases/update-app/update-app.controller.js'
import { UpdateAppRepository } from '#src/app/app-management/use-cases/update-app/update-app.repository.js'
import { UpdateAppUseCase } from '#src/app/app-management/use-cases/update-app/update-app.use-case.js'

@Module({
  controllers: [UpdateAppController],
  providers: [UpdateAppUseCase, UpdateAppRepository],
})
export class UpdateAppModule {}
