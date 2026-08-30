import { Controller, Delete, HttpCode, Param } from '@nestjs/common'
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { DeleteAppUseCase } from '#src/app/app-management/use-cases/delete-app/delete-app.use-case.js'
import { Roles } from '#src/app/auth/decorators/roles.decorator.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { SESSION_COOKIE_SECURITY_SCHEME } from '#src/modules/swagger/build-api-documentation.js'

@ApiTags('apps')
@Controller({ path: 'apps/:slug', version: '1' })
export class DeleteAppController {
  constructor(private readonly usecase: DeleteAppUseCase) {}

  @Delete()
  @Roles(UserRole.Operator, UserRole.Member)
  @ApiCookieAuth(SESSION_COOKIE_SECURITY_SCHEME)
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'The app and its Kubernetes resources were removed.' })
  @ApiForbiddenResponse({ description: 'Your account is not approved for this action.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  @ApiNotFoundResponse({ description: 'No app with that slug.' })
  @ApiResponse({ status: 502, description: 'Kubernetes teardown failed; the app was kept.' })
  handle(@Param('slug') slug: string): Promise<void> {
    return this.usecase.execute(slug)
  }
}
