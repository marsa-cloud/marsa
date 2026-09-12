import { Controller, Get, Param, Query } from '@nestjs/common'
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { Roles } from '#src/app/auth/decorators/roles.decorator.js'
import { ViewReleaseIndexQuery } from '#src/app/release/use-cases/view-release-index/query/view-release-index.query.js'
import { ViewReleaseIndexResponse } from '#src/app/release/use-cases/view-release-index/view-release-index.response.js'
import { ViewReleaseIndexUseCase } from '#src/app/release/use-cases/view-release-index/view-release-index.use-case.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { SESSION_COOKIE_SECURITY_SCHEME } from '#src/modules/swagger/build-api-documentation.js'

@ApiTags('releases')
@Controller({ path: 'apps/:slug/releases', version: '1' })
export class ViewReleaseIndexController {
  constructor(private readonly usecase: ViewReleaseIndexUseCase) {}

  @Get()
  @Roles(UserRole.Operator, UserRole.Member)
  @ApiCookieAuth(SESSION_COOKIE_SECURITY_SCHEME)
  @ApiOkResponse({ type: ViewReleaseIndexResponse })
  @ApiForbiddenResponse({ description: 'Your account is not approved for this action.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  handle(
    @Param('slug') slug: string,
    @Query() query: ViewReleaseIndexQuery,
  ): Promise<ViewReleaseIndexResponse> {
    return this.usecase.execute(slug, query)
  }
}
