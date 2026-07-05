import { Controller, Get, Param, UseGuards } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'

import { SessionAuthGuard } from '#src/app/auth/guards/session-auth.guard.js'
import { GetAppDeployEventsResponse } from '#src/app/deployments/use-cases/get-app-deploy-events/get-app-deploy-events.response.js'
import { GetAppDeployEventsUseCase } from '#src/app/deployments/use-cases/get-app-deploy-events/get-app-deploy-events.use-case.js'

@ApiTags('deployments')
@Controller({ path: 'deployments/apps/:slug/deploy-events', version: '1' })
export class GetAppDeployEventsController {
  constructor(private readonly usecase: GetAppDeployEventsUseCase) {}

  @Get()
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ operationId: 'getAppDeployEventsV1' })
  @ApiOkResponse({ type: GetAppDeployEventsResponse })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  handle(@Param('slug') slug: string): Promise<GetAppDeployEventsResponse> {
    return this.usecase.execute(slug)
  }
}
