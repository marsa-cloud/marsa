import { Module } from '@nestjs/common'

import { DeployAppModule } from '#src/app/deployments/use-cases/deploy-app/deploy-app.module.js'

@Module({
  imports: [DeployAppModule],
})
export class DeploymentsModule {}
