import { Controller, Get, Param, Query } from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { ViewAppLogsQuery } from '#src/app/app-management/use-cases/view-app-logs/view-app-logs.query.js'
import { ViewAppLogsResponse } from '#src/app/app-management/use-cases/view-app-logs/view-app-logs.response.js'
import { ViewAppLogsUseCase } from '#src/app/app-management/use-cases/view-app-logs/view-app-logs.use-case.js'
import { Roles } from '#src/app/auth/decorators/roles.decorator.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { SESSION_COOKIE_SECURITY_SCHEME } from '#src/modules/swagger/build-api-documentation.js'

@ApiTags('apps')
@Controller({ path: 'apps/:slug/logs', version: '1' })
export class ViewAppLogsController {
  constructor(private readonly usecase: ViewAppLogsUseCase) {}

  @Get()
  @Roles(UserRole.Operator, UserRole.Member)
  @ApiCookieAuth(SESSION_COOKIE_SECURITY_SCHEME)
  @ApiOkResponse({ type: ViewAppLogsResponse })
  @ApiForbiddenResponse({ description: 'Your account is not approved for this action.' })
  @ApiBadRequestResponse({ description: 'tailLines out of range (1–1000) or not an integer.' })
  @ApiNotFoundResponse({ description: 'No app with that slug.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  handle(
    @Param('slug') slug: string,
    @Query() query: ViewAppLogsQuery,
  ): Promise<ViewAppLogsResponse> {
    return this.usecase.execute(slug, query.tailLines)
  }
}
