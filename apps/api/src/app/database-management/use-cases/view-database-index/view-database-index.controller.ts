import { Controller, Get, Query } from '@nestjs/common'
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { Roles } from '#src/app/auth/decorators/roles.decorator.js'
import { ViewDatabaseIndexQuery } from '#src/app/database-management/use-cases/view-database-index/query/view-database-index.query.js'
import { ViewDatabaseIndexResponse } from '#src/app/database-management/use-cases/view-database-index/view-database-index.response.js'
import { ViewDatabaseIndexUseCase } from '#src/app/database-management/use-cases/view-database-index/view-database-index.use-case.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { SESSION_COOKIE_SECURITY_SCHEME } from '#src/modules/swagger/build-api-documentation.js'

@ApiTags('databases')
@Controller({ path: 'databases', version: '1' })
export class ViewDatabaseIndexController {
  constructor(private readonly usecase: ViewDatabaseIndexUseCase) {}

  @Get()
  @Roles(UserRole.Operator, UserRole.Member)
  @ApiCookieAuth(SESSION_COOKIE_SECURITY_SCHEME)
  @ApiOkResponse({ type: ViewDatabaseIndexResponse })
  @ApiForbiddenResponse({ description: 'Your account is not approved for this action.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  handle(@Query() query: ViewDatabaseIndexQuery): Promise<ViewDatabaseIndexResponse> {
    return this.usecase.execute(query)
  }
}
