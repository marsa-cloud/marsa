import { Controller, Get } from '@nestjs/common'
import {
  ApiBadGatewayResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { Roles } from '#src/app/auth/decorators/roles.decorator.js'
import { ViewRepositoryIndexResponse } from '#src/app/github-app/use-cases/view-repository-index/view-repository-index.response.js'
import { ViewRepositoryIndexUseCase } from '#src/app/github-app/use-cases/view-repository-index/view-repository-index.use-case.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { SESSION_COOKIE_SECURITY_SCHEME } from '#src/modules/swagger/build-api-documentation.js'

@ApiTags('github-app')
@Controller({ path: 'github-app/repositories', version: '1' })
export class ViewRepositoryIndexController {
  constructor(private readonly usecase: ViewRepositoryIndexUseCase) {}

  @Get()
  @Roles(UserRole.Operator, UserRole.Member)
  @ApiCookieAuth(SESSION_COOKIE_SECURITY_SCHEME)
  @ApiOkResponse({ type: ViewRepositoryIndexResponse })
  @ApiBadGatewayResponse({ description: 'GitHub refused every installation.' })
  @ApiForbiddenResponse({ description: 'Your account is not approved for this action.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  handle(): Promise<ViewRepositoryIndexResponse> {
    return this.usecase.execute()
  }
}
