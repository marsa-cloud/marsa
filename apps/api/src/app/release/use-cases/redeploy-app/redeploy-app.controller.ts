import { Controller, HttpCode, Param, Post } from '@nestjs/common'
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { Roles } from '#src/app/auth/decorators/roles.decorator.js'
import { RedeployAppResponse } from '#src/app/release/use-cases/redeploy-app/redeploy-app.response.js'
import { RedeployAppUseCase } from '#src/app/release/use-cases/redeploy-app/redeploy-app.use-case.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { SESSION_COOKIE_SECURITY_SCHEME } from '#src/modules/swagger/build-api-documentation.js'

@ApiTags('releases')
@Controller({ path: 'apps/:slug/redeploy', version: '1' })
export class RedeployAppController {
  constructor(private readonly usecase: RedeployAppUseCase) {}

  @Post()
  @Roles(UserRole.Operator, UserRole.Member)
  @ApiCookieAuth(SESSION_COOKIE_SECURITY_SCHEME)
  @HttpCode(200)
  @ApiOkResponse({ type: RedeployAppResponse })
  @ApiForbiddenResponse({ description: 'Your account is not approved for this action.' })
  @ApiNotFoundResponse({ description: 'No app with that slug.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  @ApiInternalServerErrorResponse({
    description: 'Stored image pull credentials could not be decrypted.',
  })
  handle(@Param('slug') slug: string): Promise<RedeployAppResponse> {
    return this.usecase.execute(slug)
  }
}
