import { Controller, Get, Param } from '@nestjs/common'
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { ViewAppHealthResponse } from '#src/app/app-management/use-cases/view-app-health/view-app-health.response.js'
import { ViewAppHealthUseCase } from '#src/app/app-management/use-cases/view-app-health/view-app-health.use-case.js'
import { Roles } from '#src/app/auth/decorators/roles.decorator.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { SESSION_COOKIE_SECURITY_SCHEME } from '#src/modules/swagger/build-api-documentation.js'

@ApiTags('apps')
@Controller({ path: 'apps/:slug/health', version: '1' })
export class ViewAppHealthController {
  constructor(private readonly usecase: ViewAppHealthUseCase) {}

  @Get()
  @Roles(UserRole.Operator, UserRole.Member)
  @ApiCookieAuth(SESSION_COOKIE_SECURITY_SCHEME)
  @ApiOkResponse({ type: ViewAppHealthResponse })
  @ApiForbiddenResponse({ description: 'Your account is not approved for this action.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  handle(@Param('slug') slug: string): Promise<ViewAppHealthResponse> {
    return this.usecase.execute(slug)
  }
}
