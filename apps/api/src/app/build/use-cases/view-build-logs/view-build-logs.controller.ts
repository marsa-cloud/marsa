import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { Roles } from '#src/app/auth/decorators/roles.decorator.js'
import type { BuildUuid } from '#src/app/build/entities/build.uuid.js'
import { ViewBuildLogsResponse } from '#src/app/build/use-cases/view-build-logs/view-build-logs.response.js'
import { ViewBuildLogsUseCase } from '#src/app/build/use-cases/view-build-logs/view-build-logs.use-case.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { SESSION_COOKIE_SECURITY_SCHEME } from '#src/modules/swagger/build-api-documentation.js'

@ApiTags('builds')
@Controller({ path: 'apps/:slug/builds/:buildUuid/logs', version: '1' })
export class ViewBuildLogsController {
  constructor(private readonly usecase: ViewBuildLogsUseCase) {}

  @Get()
  @Roles(UserRole.Operator, UserRole.Member)
  @ApiCookieAuth(SESSION_COOKIE_SECURITY_SCHEME)
  @ApiOkResponse({ type: ViewBuildLogsResponse })
  @ApiBadRequestResponse({ description: 'buildUuid is not a uuid.' })
  @ApiNotFoundResponse({ description: 'No such build for the app, or its logs have expired.' })
  @ApiForbiddenResponse({ description: 'Your account is not approved for this action.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  handle(
    @Param('slug') slug: string,
    @Param('buildUuid', new ParseUUIDPipe()) buildUuid: string,
  ): Promise<ViewBuildLogsResponse> {
    return this.usecase.execute(slug, buildUuid as BuildUuid)
  }
}
