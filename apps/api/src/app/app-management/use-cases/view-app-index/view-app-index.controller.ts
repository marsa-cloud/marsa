import { Controller, Get } from '@nestjs/common'
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { ViewAppIndexResponse } from '#src/app/app-management/use-cases/view-app-index/view-app-index.response.js'
import { ViewAppIndexUseCase } from '#src/app/app-management/use-cases/view-app-index/view-app-index.use-case.js'
import { Roles } from '#src/app/auth/decorators/roles.decorator.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { SESSION_COOKIE_SECURITY_SCHEME } from '#src/modules/swagger/build-api-documentation.js'

@ApiTags('apps')
@Controller({ path: 'apps', version: '1' })
export class ViewAppIndexController {
  constructor(private readonly usecase: ViewAppIndexUseCase) {}

  @Get()
  @Roles(UserRole.Operator, UserRole.Member)
  @ApiCookieAuth(SESSION_COOKIE_SECURITY_SCHEME)
  @ApiOkResponse({ type: ViewAppIndexResponse })
  @ApiForbiddenResponse({ description: 'Your account is not approved for this action.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  handle(): Promise<ViewAppIndexResponse> {
    return this.usecase.execute()
  }
}
