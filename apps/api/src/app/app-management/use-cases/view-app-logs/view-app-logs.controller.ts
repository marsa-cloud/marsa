import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { ViewAppLogsQuery } from '#src/app/app-management/use-cases/view-app-logs/view-app-logs.query.js'
import { ViewAppLogsResponse } from '#src/app/app-management/use-cases/view-app-logs/view-app-logs.response.js'
import { ViewAppLogsUseCase } from '#src/app/app-management/use-cases/view-app-logs/view-app-logs.use-case.js'
import { SessionAuthGuard } from '#src/app/auth/guards/session-auth.guard.js'

@ApiTags('apps')
@Controller({ path: 'apps/:slug/logs', version: '1' })
export class ViewAppLogsController {
  constructor(private readonly usecase: ViewAppLogsUseCase) {}

  @Get()
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ operationId: 'viewAppLogsV1' })
  @ApiOkResponse({ type: ViewAppLogsResponse })
  @ApiBadRequestResponse({ description: 'tailLines out of range (1–1000) or not an integer.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  handle(
    @Param('slug') slug: string,
    @Query() query: ViewAppLogsQuery,
  ): Promise<ViewAppLogsResponse> {
    return this.usecase.execute(slug, query.tailLines)
  }
}
