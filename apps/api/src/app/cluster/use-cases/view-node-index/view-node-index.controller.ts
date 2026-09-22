import { Controller, Get } from '@nestjs/common'
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { Roles } from '#src/app/auth/decorators/roles.decorator.js'
import { ViewNodeIndexResponse } from '#src/app/cluster/use-cases/view-node-index/view-node-index.response.js'
import { ViewNodeIndexUseCase } from '#src/app/cluster/use-cases/view-node-index/view-node-index.use-case.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { SESSION_COOKIE_SECURITY_SCHEME } from '#src/modules/swagger/build-api-documentation.js'

@ApiTags('cluster')
@Controller({ path: 'nodes', version: '1' })
export class ViewNodeIndexController {
  constructor(private readonly usecase: ViewNodeIndexUseCase) {}

  @Get()
  @Roles(UserRole.Operator, UserRole.Member)
  @ApiCookieAuth(SESSION_COOKIE_SECURITY_SCHEME)
  @ApiOkResponse({ type: ViewNodeIndexResponse })
  @ApiForbiddenResponse({ description: 'Your account is not approved for this action.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  handle(): Promise<ViewNodeIndexResponse> {
    return this.usecase.execute()
  }
}
