import { Module } from '@nestjs/common'
import { CreateEnvironmentModule } from '#src/app/environment/use-cases/create-environment/create-environment.module.js'
import { DeleteEnvironmentModule } from '#src/app/environment/use-cases/delete-environment/delete-environment.module.js'
import { ViewEnvironmentIndexModule } from '#src/app/environment/use-cases/view-environment-index/view-environment-index.module.js'

@Module({
  imports: [CreateEnvironmentModule, ViewEnvironmentIndexModule, DeleteEnvironmentModule],
})
export class EnvironmentModule {}
