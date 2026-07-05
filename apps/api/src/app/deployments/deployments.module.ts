import { Module } from '@nestjs/common'

import { DeployAppModule } from '#src/app/deployments/use-cases/deploy-app/deploy-app.module.js'
import { GetAppDeployEventsModule } from '#src/app/deployments/use-cases/get-app-deploy-events/get-app-deploy-events.module.js'
import { GetAppHealthModule } from '#src/app/deployments/use-cases/get-app-health/get-app-health.module.js'
import { ListAppReleasesModule } from '#src/app/deployments/use-cases/list-app-releases/list-app-releases.module.js'

@Module({
  imports: [DeployAppModule, ListAppReleasesModule, GetAppHealthModule, GetAppDeployEventsModule],
})
export class DeploymentsModule {}
