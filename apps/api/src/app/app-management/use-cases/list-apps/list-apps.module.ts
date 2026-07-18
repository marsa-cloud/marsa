import { MikroOrmModule } from '@mikro-orm/nestjs'
import { Module } from '@nestjs/common'
import { App } from '#src/app/app-management/entities/app.entity.js'
import { ListAppsController } from '#src/app/app-management/use-cases/list-apps/list-apps.controller.js'
import { ListAppsRepository } from '#src/app/app-management/use-cases/list-apps/list-apps.repository.js'
import { ListAppsUseCase } from '#src/app/app-management/use-cases/list-apps/list-apps.use-case.js'

@Module({
  imports: [MikroOrmModule.forFeature([App])],
  controllers: [ListAppsController],
  providers: [ListAppsUseCase, ListAppsRepository],
})
export class ListAppsModule {}
