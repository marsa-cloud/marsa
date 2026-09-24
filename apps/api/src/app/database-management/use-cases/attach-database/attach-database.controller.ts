import { Body, Controller, Param, Post } from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { Roles } from '#src/app/auth/decorators/roles.decorator.js'
import { AttachDatabaseCommand } from '#src/app/database-management/use-cases/attach-database/attach-database.command.js'
import { AttachDatabaseResponse } from '#src/app/database-management/use-cases/attach-database/attach-database.response.js'
import { AttachDatabaseUseCase } from '#src/app/database-management/use-cases/attach-database/attach-database.use-case.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { SESSION_COOKIE_SECURITY_SCHEME } from '#src/modules/swagger/build-api-documentation.js'

@ApiTags('databases')
@Controller({ path: 'apps/:slug/attachments', version: '1' })
export class AttachDatabaseController {
  constructor(private readonly usecase: AttachDatabaseUseCase) {}

  @Post()
  @Roles(UserRole.Operator, UserRole.Member)
  @ApiCookieAuth(SESSION_COOKIE_SECURITY_SCHEME)
  @ApiCreatedResponse({ type: AttachDatabaseResponse })
  @ApiBadRequestResponse({ description: 'Malformed body, or an invalid database slug / alias.' })
  @ApiNotFoundResponse({ description: 'No such app, or no such database in its environment.' })
  @ApiConflictResponse({ description: 'Already attached, or the alias is taken.' })
  @ApiForbiddenResponse({ description: 'Your account is not approved for this action.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  @ApiResponse({
    status: 502,
    description: 'The cluster update failed; the attachment was not kept.',
  })
  handle(
    @Param('slug') slug: string,
    @Body() command: AttachDatabaseCommand,
  ): Promise<AttachDatabaseResponse> {
    return this.usecase.execute(slug, command)
  }
}
