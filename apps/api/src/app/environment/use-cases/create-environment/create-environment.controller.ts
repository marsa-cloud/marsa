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
import { CreateEnvironmentCommand } from '#src/app/environment/use-cases/create-environment/create-environment.command.js'
import { CreateEnvironmentResponse } from '#src/app/environment/use-cases/create-environment/create-environment.response.js'
import { CreateEnvironmentUseCase } from '#src/app/environment/use-cases/create-environment/create-environment.use-case.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { SESSION_COOKIE_SECURITY_SCHEME } from '#src/modules/swagger/build-api-documentation.js'

@ApiTags('environments')
@Controller({ path: 'projects/:projectSlug/environments', version: '1' })
export class CreateEnvironmentController {
  constructor(private readonly usecase: CreateEnvironmentUseCase) {}

  @Post()
  @Roles(UserRole.Operator, UserRole.Member)
  @ApiCookieAuth(SESSION_COOKIE_SECURITY_SCHEME)
  @ApiCreatedResponse({ type: CreateEnvironmentResponse })
  @ApiBadRequestResponse({ description: 'Malformed body, or an invalid name / slug.' })
  @ApiNotFoundResponse({ description: 'No project with that slug.' })
  @ApiConflictResponse({
    description:
      'The slug is taken in this project, or the environment is taken or still being removed.',
  })
  @ApiResponse({ status: 502, description: 'The environment could not be provisioned.' })
  @ApiForbiddenResponse({ description: 'Your account is not approved for this action.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  handle(
    @Param('projectSlug') projectSlug: string,
    @Body() command: CreateEnvironmentCommand,
  ): Promise<CreateEnvironmentResponse> {
    return this.usecase.execute(projectSlug, command)
  }
}
