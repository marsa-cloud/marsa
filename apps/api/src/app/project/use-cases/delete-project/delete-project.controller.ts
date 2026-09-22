import { Controller, Delete, HttpCode, Param } from '@nestjs/common'
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { Roles } from '#src/app/auth/decorators/roles.decorator.js'
import { DeleteProjectUseCase } from '#src/app/project/use-cases/delete-project/delete-project.use-case.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { SESSION_COOKIE_SECURITY_SCHEME } from '#src/modules/swagger/build-api-documentation.js'

@ApiTags('projects')
@Controller({ path: 'projects/:slug', version: '1' })
export class DeleteProjectController {
  constructor(private readonly usecase: DeleteProjectUseCase) {}

  @Delete()
  @Roles(UserRole.Operator, UserRole.Member)
  @ApiCookieAuth(SESSION_COOKIE_SECURITY_SCHEME)
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'The project was deleted.' })
  @ApiNotFoundResponse({ description: 'No project with that slug.' })
  @ApiConflictResponse({ description: 'The project still has environments.' })
  @ApiForbiddenResponse({ description: 'Your account is not approved for this action.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  handle(@Param('slug') slug: string): Promise<void> {
    return this.usecase.execute(slug)
  }
}
