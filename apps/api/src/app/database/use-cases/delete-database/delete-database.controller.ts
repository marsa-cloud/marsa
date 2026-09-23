import { Controller, Delete, HttpCode, Param } from '@nestjs/common'
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { Roles } from '#src/app/auth/decorators/roles.decorator.js'
import { DeleteDatabaseUseCase } from '#src/app/database/use-cases/delete-database/delete-database.use-case.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { SESSION_COOKIE_SECURITY_SCHEME } from '#src/modules/swagger/build-api-documentation.js'

@ApiTags('databases')
@Controller({ path: 'databases/:slug', version: '1' })
export class DeleteDatabaseController {
  constructor(private readonly usecase: DeleteDatabaseUseCase) {}

  @Delete()
  @Roles(UserRole.Operator, UserRole.Member)
  @ApiCookieAuth(SESSION_COOKIE_SECURITY_SCHEME)
  @HttpCode(204)
  @ApiNoContentResponse({
    description: 'The database, its Kubernetes resources and its data were removed.',
  })
  @ApiForbiddenResponse({ description: 'Your account is not approved for this action.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  @ApiNotFoundResponse({ description: 'No database with that slug.' })
  @ApiResponse({ status: 502, description: 'Kubernetes teardown failed; the database was kept.' })
  handle(@Param('slug') slug: string): Promise<void> {
    return this.usecase.execute(slug)
  }
}
