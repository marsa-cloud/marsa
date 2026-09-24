import { Controller, Get, Param } from '@nestjs/common'
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { Roles } from '#src/app/auth/decorators/roles.decorator.js'
import { ViewDatabaseDependentIndexResponse } from '#src/app/database-management/use-cases/view-database-dependent-index/view-database-dependent-index.response.js'
import { ViewDatabaseDependentIndexUseCase } from '#src/app/database-management/use-cases/view-database-dependent-index/view-database-dependent-index.use-case.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { SESSION_COOKIE_SECURITY_SCHEME } from '#src/modules/swagger/build-api-documentation.js'

@ApiTags('databases')
@Controller({ path: 'databases/:slug/dependents', version: '1' })
export class ViewDatabaseDependentIndexController {
  constructor(private readonly usecase: ViewDatabaseDependentIndexUseCase) {}

  @Get()
  @Roles(UserRole.Operator, UserRole.Member)
  @ApiCookieAuth(SESSION_COOKIE_SECURITY_SCHEME)
  @ApiOkResponse({ type: ViewDatabaseDependentIndexResponse })
  @ApiNotFoundResponse({ description: 'No database with that slug.' })
  @ApiForbiddenResponse({ description: 'Your account is not approved for this action.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  handle(@Param('slug') slug: string): Promise<ViewDatabaseDependentIndexResponse> {
    return this.usecase.execute(slug)
  }
}
