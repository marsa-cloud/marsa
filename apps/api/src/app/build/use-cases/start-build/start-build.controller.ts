import { Controller, Param, Post } from '@nestjs/common'
import {
  ApiBadGatewayResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger'
import { Roles } from '#src/app/auth/decorators/roles.decorator.js'
import { BuildSummary } from '#src/app/build/responses/build-summary.response.js'
import { StartBuildUseCase } from '#src/app/build/use-cases/start-build/start-build.use-case.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { SESSION_COOKIE_SECURITY_SCHEME } from '#src/modules/swagger/build-api-documentation.js'

@ApiTags('builds')
@Controller({ path: 'apps/:slug/builds', version: '1' })
export class StartBuildController {
  constructor(private readonly usecase: StartBuildUseCase) {}

  @Post()
  @Roles(UserRole.Operator, UserRole.Member)
  @ApiCookieAuth(SESSION_COOKIE_SECURITY_SCHEME)
  @ApiCreatedResponse({ type: BuildSummary })
  @ApiNotFoundResponse({ description: 'No app with that slug.' })
  @ApiConflictResponse({ description: 'The app deploys a prebuilt image.' })
  @ApiUnprocessableEntityResponse({ description: 'The branch is missing or not accessible.' })
  @ApiBadGatewayResponse({ description: 'GitHub refused the installation token.' })
  @ApiForbiddenResponse({ description: 'Your account is not approved for this action.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  handle(@Param('slug') slug: string): Promise<BuildSummary> {
    return this.usecase.execute(slug)
  }
}
