import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { SessionAuthGuard } from '#src/app/auth/guards/session-auth.guard.js'
import { GetAppRunLogsQuery } from '#src/app/deployments/use-cases/get-app-run-logs/get-app-run-logs.query.js'
import { GetAppRunLogsResponse } from '#src/app/deployments/use-cases/get-app-run-logs/get-app-run-logs.response.js'
import { GetAppRunLogsUseCase } from '#src/app/deployments/use-cases/get-app-run-logs/get-app-run-logs.use-case.js'

@ApiTags('deployments')
@Controller({ path: 'deployments/apps/:slug/logs', version: '1' })
export class GetAppRunLogsController {
  constructor(private readonly usecase: GetAppRunLogsUseCase) {}

  @Get()
  @UseGuards(SessionAuthGuard)
  @ApiOkResponse({ type: GetAppRunLogsResponse })
  @ApiBadRequestResponse({ description: 'tailLines out of range (1–1000) or not an integer.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  handle(
    @Param('slug') slug: string,
    @Query() query: GetAppRunLogsQuery,
  ): Promise<GetAppRunLogsResponse> {
    return this.usecase.execute(slug, query.tailLines)
  }
}
