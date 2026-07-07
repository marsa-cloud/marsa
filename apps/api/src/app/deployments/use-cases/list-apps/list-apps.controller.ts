import { Controller, Get, UseGuards } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'

import { SessionAuthGuard } from '#src/app/auth/guards/session-auth.guard.js'
import { ListAppsResponse } from '#src/app/deployments/use-cases/list-apps/list-apps.response.js'
import { ListAppsUseCase } from '#src/app/deployments/use-cases/list-apps/list-apps.use-case.js'

@ApiTags('deployments')
@Controller({ path: 'deployments/apps', version: '1' })
export class ListAppsController {
  constructor(private readonly usecase: ListAppsUseCase) {}

  @Get()
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ operationId: 'listAppsV1' })
  @ApiOkResponse({ type: ListAppsResponse })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  handle(): Promise<ListAppsResponse> {
    return this.usecase.execute()
  }
}
