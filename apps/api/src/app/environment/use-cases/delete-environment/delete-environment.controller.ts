import { Controller, Delete, HttpCode, Param } from '@nestjs/common'
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { Roles } from '#src/app/auth/decorators/roles.decorator.js'
import { DeleteEnvironmentUseCase } from '#src/app/environment/use-cases/delete-environment/delete-environment.use-case.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { SESSION_COOKIE_SECURITY_SCHEME } from '#src/modules/swagger/build-api-documentation.js'

@ApiTags('environments')
@Controller({ path: 'projects/:projectSlug/environments/:environmentSlug', version: '1' })
export class DeleteEnvironmentController {
  constructor(private readonly usecase: DeleteEnvironmentUseCase) {}

  @Delete()
  @Roles(UserRole.Operator, UserRole.Member)
  @ApiCookieAuth(SESSION_COOKIE_SECURITY_SCHEME)
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'The environment and its namespace were deleted.' })
  @ApiNotFoundResponse({ description: 'No environment with that slug in the project.' })
  @ApiConflictResponse({ description: 'The environment still has apps.' })
  @ApiResponse({ status: 502, description: 'The namespace could not be deleted; nothing changed.' })
  @ApiForbiddenResponse({ description: 'Your account is not approved for this action.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  handle(
    @Param('projectSlug') projectSlug: string,
    @Param('environmentSlug') environmentSlug: string,
  ): Promise<void> {
    return this.usecase.execute(projectSlug, environmentSlug)
  }
}
