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
import { DetachDatabaseUseCase } from '#src/app/database-management/use-cases/detach-database/detach-database.use-case.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { SESSION_COOKIE_SECURITY_SCHEME } from '#src/modules/swagger/build-api-documentation.js'

@ApiTags('databases')
@Controller({ path: 'apps/:slug/attachments/:databaseSlug', version: '1' })
export class DetachDatabaseController {
  constructor(private readonly usecase: DetachDatabaseUseCase) {}

  @Delete()
  @HttpCode(204)
  @Roles(UserRole.Operator, UserRole.Member)
  @ApiCookieAuth(SESSION_COOKIE_SECURITY_SCHEME)
  @ApiNoContentResponse({ description: 'The variables were removed and the app restarted.' })
  @ApiNotFoundResponse({ description: 'No such app, or that database is not attached to it.' })
  @ApiForbiddenResponse({ description: 'Your account is not approved for this action.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  @ApiResponse({
    status: 502,
    description: 'The cluster update failed; the attachment was kept.',
  })
  handle(@Param('slug') slug: string, @Param('databaseSlug') databaseSlug: string): Promise<void> {
    return this.usecase.execute(slug, databaseSlug)
  }
}
