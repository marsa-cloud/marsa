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
import { ViewEnvironmentIndexResponse } from '#src/app/environment/use-cases/view-environment-index/view-environment-index.response.js'
import { ViewEnvironmentIndexUseCase } from '#src/app/environment/use-cases/view-environment-index/view-environment-index.use-case.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { SESSION_COOKIE_SECURITY_SCHEME } from '#src/modules/swagger/build-api-documentation.js'

@ApiTags('environments')
@Controller({ path: 'projects/:projectSlug/environments', version: '1' })
export class ViewEnvironmentIndexController {
  constructor(private readonly usecase: ViewEnvironmentIndexUseCase) {}

  @Get()
  @Roles(UserRole.Operator, UserRole.Member)
  @ApiCookieAuth(SESSION_COOKIE_SECURITY_SCHEME)
  @ApiOkResponse({ type: ViewEnvironmentIndexResponse })
  @ApiNotFoundResponse({ description: 'No project with that slug.' })
  @ApiForbiddenResponse({ description: 'Your account is not approved for this action.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  handle(@Param('projectSlug') projectSlug: string): Promise<ViewEnvironmentIndexResponse> {
    return this.usecase.execute(projectSlug)
  }
}
