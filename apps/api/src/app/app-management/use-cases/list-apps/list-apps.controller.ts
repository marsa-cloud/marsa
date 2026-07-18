import { Controller, Get, UseGuards } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { ListAppsResponse } from '#src/app/app-management/use-cases/list-apps/list-apps.response.js'
import { ListAppsUseCase } from '#src/app/app-management/use-cases/list-apps/list-apps.use-case.js'
import { SessionAuthGuard } from '#src/app/auth/guards/session-auth.guard.js'

@ApiTags('apps')
@Controller({ path: 'apps', version: '1' })
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
