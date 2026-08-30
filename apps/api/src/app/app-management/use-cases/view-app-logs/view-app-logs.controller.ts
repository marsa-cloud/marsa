import { Controller, Get, Param, Query } from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { ViewAppLogsQuery } from '#src/app/app-management/use-cases/view-app-logs/view-app-logs.query.js'
import { ViewAppLogsResponse } from '#src/app/app-management/use-cases/view-app-logs/view-app-logs.response.js'
import { ViewAppLogsUseCase } from '#src/app/app-management/use-cases/view-app-logs/view-app-logs.use-case.js'
import { Roles } from '#src/app/auth/decorators/roles.decorator.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'

@ApiTags('apps')
@Controller({ path: 'apps/:slug/logs', version: '1' })
export class ViewAppLogsController {
  constructor(private readonly usecase: ViewAppLogsUseCase) {}

  @Get()
  @Roles(UserRole.Operator, UserRole.Member)
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
