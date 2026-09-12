import { Body, Controller, Param, Put } from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { UpdateAppEnvCommand } from '#src/app/app-management/use-cases/update-app-env/update-app-env.command.js'
import { UpdateAppEnvResponse } from '#src/app/app-management/use-cases/update-app-env/update-app-env.response.js'
import { UpdateAppEnvUseCase } from '#src/app/app-management/use-cases/update-app-env/update-app-env.use-case.js'
import { Roles } from '#src/app/auth/decorators/roles.decorator.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { SESSION_COOKIE_SECURITY_SCHEME } from '#src/modules/swagger/build-api-documentation.js'

@ApiTags('apps')
@Controller({ path: 'apps/:slug/env', version: '1' })
export class UpdateAppEnvController {
  constructor(private readonly usecase: UpdateAppEnvUseCase) {}

  @Put()
  @Roles(UserRole.Operator, UserRole.Member)
  @ApiCookieAuth(SESSION_COOKIE_SECURITY_SCHEME)
  @ApiOkResponse({ type: UpdateAppEnvResponse })
  @ApiForbiddenResponse({ description: 'Your account is not approved for this action.' })
  @ApiBadRequestResponse({ description: 'env is not an object of string values with valid keys.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  @ApiNotFoundResponse({ description: 'No app with that slug.' })
  handle(
    @Param('slug') slug: string,
    @Body() command: UpdateAppEnvCommand,
  ): Promise<UpdateAppEnvResponse> {
    return this.usecase.execute(slug, command)
  }
}
