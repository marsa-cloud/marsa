import { Body, Controller, Post } from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { Roles } from '#src/app/auth/decorators/roles.decorator.js'
import { CreateProjectCommand } from '#src/app/project/use-cases/create-project/create-project.command.js'
import { CreateProjectResponse } from '#src/app/project/use-cases/create-project/create-project.response.js'
import { CreateProjectUseCase } from '#src/app/project/use-cases/create-project/create-project.use-case.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { SESSION_COOKIE_SECURITY_SCHEME } from '#src/modules/swagger/build-api-documentation.js'

@ApiTags('projects')
@Controller({ path: 'projects', version: '1' })
export class CreateProjectController {
  constructor(private readonly usecase: CreateProjectUseCase) {}

  @Post()
  @Roles(UserRole.Operator, UserRole.Member)
  @ApiCookieAuth(SESSION_COOKIE_SECURITY_SCHEME)
  @ApiCreatedResponse({ type: CreateProjectResponse })
  @ApiBadRequestResponse({ description: 'Malformed body, or an invalid name / slug.' })
  @ApiConflictResponse({ description: 'A project with that slug already exists.' })
  @ApiForbiddenResponse({ description: 'Your account is not approved for this action.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  handle(@Body() command: CreateProjectCommand): Promise<CreateProjectResponse> {
    return this.usecase.execute(command)
  }
}
