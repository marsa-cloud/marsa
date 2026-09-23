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
import { ViewDatabaseDetailResponse } from '#src/app/database/use-cases/view-database-detail/view-database-detail.response.js'
import { ViewDatabaseDetailUseCase } from '#src/app/database/use-cases/view-database-detail/view-database-detail.use-case.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { SESSION_COOKIE_SECURITY_SCHEME } from '#src/modules/swagger/build-api-documentation.js'

@ApiTags('databases')
@Controller({ path: 'databases/:slug', version: '1' })
export class ViewDatabaseDetailController {
  constructor(private readonly usecase: ViewDatabaseDetailUseCase) {}

  @Get()
  @Roles(UserRole.Operator, UserRole.Member)
  @ApiCookieAuth(SESSION_COOKIE_SECURITY_SCHEME)
  @ApiOkResponse({ type: ViewDatabaseDetailResponse })
  @ApiNotFoundResponse({ description: 'No database with that slug.' })
  @ApiForbiddenResponse({ description: 'Your account is not approved for this action.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  handle(@Param('slug') slug: string): Promise<ViewDatabaseDetailResponse> {
    return this.usecase.execute(slug)
  }
}
