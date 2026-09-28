import { Controller, Get, Param, Query } from '@nestjs/common'
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { Roles } from '#src/app/auth/decorators/roles.decorator.js'
import { ViewBuildIndexQuery } from '#src/app/build-management/use-cases/view-build-index/query/view-build-index.query.js'
import { ViewBuildIndexResponse } from '#src/app/build-management/use-cases/view-build-index/view-build-index.response.js'
import { ViewBuildIndexUseCase } from '#src/app/build-management/use-cases/view-build-index/view-build-index.use-case.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { SESSION_COOKIE_SECURITY_SCHEME } from '#src/modules/swagger/build-api-documentation.js'

@ApiTags('builds')
@Controller({ path: 'apps/:slug/builds', version: '1' })
export class ViewBuildIndexController {
  constructor(private readonly usecase: ViewBuildIndexUseCase) {}

  @Get()
  @Roles(UserRole.Operator, UserRole.Member)
  @ApiCookieAuth(SESSION_COOKIE_SECURITY_SCHEME)
  @ApiOkResponse({ type: ViewBuildIndexResponse })
  @ApiForbiddenResponse({ description: 'Your account is not approved for this action.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  handle(
    @Param('slug') slug: string,
    @Query() query: ViewBuildIndexQuery,
  ): Promise<ViewBuildIndexResponse> {
    return this.usecase.execute(slug, query)
  }
}
