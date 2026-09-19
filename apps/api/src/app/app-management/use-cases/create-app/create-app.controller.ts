import { Body, Controller, Post } from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { CreateAppCommand } from '#src/app/app-management/use-cases/create-app/create-app.command.js'
import { CreateAppResponse } from '#src/app/app-management/use-cases/create-app/create-app.response.js'
import { CreateAppUseCase } from '#src/app/app-management/use-cases/create-app/create-app.use-case.js'
import { Roles } from '#src/app/auth/decorators/roles.decorator.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { SESSION_COOKIE_SECURITY_SCHEME } from '#src/modules/swagger/build-api-documentation.js'

@ApiTags('apps')
@Controller({ path: 'apps', version: '1' })
export class CreateAppController {
  constructor(private readonly usecase: CreateAppUseCase) {}

  @Post()
  @Roles(UserRole.Operator, UserRole.Member)
  @ApiCookieAuth(SESSION_COOKIE_SECURITY_SCHEME)
  @ApiCreatedResponse({ type: CreateAppResponse })
  @ApiBadRequestResponse({ description: 'Malformed body, or an invalid slug / image / port.' })
  @ApiNotFoundResponse({ description: 'No environment with that uuid.' })
  @ApiConflictResponse({ description: 'An app with that slug already exists.' })
  @ApiForbiddenResponse({ description: 'Your account is not approved for this action.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  handle(@Body() command: CreateAppCommand): Promise<CreateAppResponse> {
    return this.usecase.execute(command)
  }
}
