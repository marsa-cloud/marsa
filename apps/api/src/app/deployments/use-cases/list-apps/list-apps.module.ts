import { MikroOrmModule } from '@mikro-orm/nestjs'
import { Module } from '@nestjs/common'
import { App } from '#src/app/deployments/entities/app.entity.js'
import { ListAppsController } from '#src/app/deployments/use-cases/list-apps/list-apps.controller.js'
import { ListAppsRepository } from '#src/app/deployments/use-cases/list-apps/list-apps.repository.js'
import { ListAppsUseCase } from '#src/app/deployments/use-cases/list-apps/list-apps.use-case.js'

@Module({
  imports: [MikroOrmModule.forFeature([App])],
  controllers: [ListAppsController],
  providers: [ListAppsUseCase, ListAppsRepository],
})
export class ListAppsModule {}
