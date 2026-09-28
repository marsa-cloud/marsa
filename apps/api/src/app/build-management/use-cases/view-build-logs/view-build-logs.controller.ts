import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common'
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
import type { BuildUuid } from '#src/app/build-management/entities/build.uuid.js'
import { ViewBuildLogsQuery } from '#src/app/build-management/use-cases/view-build-logs/view-build-logs.query.js'
import { ViewBuildLogsResponse } from '#src/app/build-management/use-cases/view-build-logs/view-build-logs.response.js'
import { ViewBuildLogsUseCase } from '#src/app/build-management/use-cases/view-build-logs/view-build-logs.use-case.js'
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
  @ApiBadRequestResponse({
    description: 'buildUuid is not a uuid, or tailLines is out of range (1–5000).',
  })
  @ApiNotFoundResponse({ description: 'No such build for the app, or its logs have expired.' })
  @ApiForbiddenResponse({ description: 'Your account is not approved for this action.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  handle(
    @Param('slug') slug: string,
    @Param('buildUuid', ParseUUIDPipe) buildUuid: BuildUuid,
    @Query() query: ViewBuildLogsQuery,
  ): Promise<ViewBuildLogsResponse> {
    return this.usecase.execute(slug, buildUuid, query.tailLines)
  }
}
