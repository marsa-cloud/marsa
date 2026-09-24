import { Body, Controller, Param, Post } from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { Roles } from '#src/app/auth/decorators/roles.decorator.js'
import { CreateReleaseCommand } from '#src/app/release/use-cases/create-release/create-release.command.js'
import { CreateReleaseResponse } from '#src/app/release/use-cases/create-release/create-release.response.js'
import { CreateReleaseUseCase } from '#src/app/release/use-cases/create-release/create-release.use-case.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { SESSION_COOKIE_SECURITY_SCHEME } from '#src/modules/swagger/build-api-documentation.js'

@ApiTags('releases')
@Controller({ path: 'apps/:slug/releases', version: '1' })
export class CreateReleaseController {
  constructor(private readonly usecase: CreateReleaseUseCase) {}

  @Post()
  @Roles(UserRole.Operator, UserRole.Member)
  @ApiCookieAuth(SESSION_COOKIE_SECURITY_SCHEME)
  @ApiCreatedResponse({ type: CreateReleaseResponse })
  @ApiBadRequestResponse({ description: 'fromReleaseUuid is not a uuid.' })
  @ApiForbiddenResponse({ description: 'Your account is not approved for this action.' })
  @ApiNotFoundResponse({ description: 'No app with that slug, or no such release for it.' })
  @ApiConflictResponse({ description: 'The app has no image yet; its first build is pending.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  handle(
    @Param('slug') slug: string,
    @Body() command: CreateReleaseCommand,
  ): Promise<CreateReleaseResponse> {
    return this.usecase.execute(slug, command)
  }
}
