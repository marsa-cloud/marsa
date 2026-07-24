import { Module } from '@nestjs/common'
import { ListAppsController } from '#src/app/deployments/use-cases/list-apps/list-apps.controller.js'
import { ListAppsRepository } from '#src/app/deployments/use-cases/list-apps/list-apps.repository.js'
import { ListAppsUseCase } from '#src/app/deployments/use-cases/list-apps/list-apps.use-case.js'

@Module({
  controllers: [ListAppsController],
  providers: [ListAppsUseCase, ListAppsRepository],
})
export class ListAppsModule {}
