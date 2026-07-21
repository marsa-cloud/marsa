import { MikroOrmModule } from '@mikro-orm/nestjs'
import { Module } from '@nestjs/common'
import { App } from '#src/app/app-management/entities/app.entity.js'
import { ViewAppIndexController } from '#src/app/app-management/use-cases/view-app-index/view-app-index.controller.js'
import { ViewAppIndexRepository } from '#src/app/app-management/use-cases/view-app-index/view-app-index.repository.js'
import { ViewAppIndexUseCase } from '#src/app/app-management/use-cases/view-app-index/view-app-index.use-case.js'

@Module({
  imports: [MikroOrmModule.forFeature([App])],
  controllers: [ViewAppIndexController],
  providers: [ViewAppIndexUseCase, ViewAppIndexRepository],
})
export class ViewAppIndexModule {}
