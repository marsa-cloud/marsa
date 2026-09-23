import { Body, Controller, Post } from '@nestjs/common'
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
import { CreateDatabaseCommand } from '#src/app/database/use-cases/create-database/create-database.command.js'
import { CreateDatabaseResponse } from '#src/app/database/use-cases/create-database/create-database.response.js'
import { CreateDatabaseUseCase } from '#src/app/database/use-cases/create-database/create-database.use-case.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { SESSION_COOKIE_SECURITY_SCHEME } from '#src/modules/swagger/build-api-documentation.js'

@ApiTags('databases')
@Controller({ path: 'databases', version: '1' })
export class CreateDatabaseController {
  constructor(private readonly usecase: CreateDatabaseUseCase) {}

  @Post()
  @Roles(UserRole.Operator, UserRole.Member)
  @ApiCookieAuth(SESSION_COOKIE_SECURITY_SCHEME)
  @ApiCreatedResponse({ type: CreateDatabaseResponse })
  @ApiBadRequestResponse({ description: 'Malformed body, or an invalid slug / version / size.' })
  @ApiNotFoundResponse({ description: 'No environment with that uuid, or an unavailable version.' })
  @ApiConflictResponse({ description: 'An app or database in that environment owns the name.' })
  @ApiForbiddenResponse({ description: 'Your account is not approved for this action.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  @ApiResponse({ status: 502, description: 'Kubernetes provisioning failed; nothing was created.' })
  handle(@Body() command: CreateDatabaseCommand): Promise<CreateDatabaseResponse> {
    return this.usecase.execute(command)
  }
}
