import { Controller, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common'
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { Roles } from '#src/app/auth/decorators/roles.decorator.js'
import type { ReleaseUuid } from '#src/app/release/entities/release.uuid.js'
import { DeployReleaseResponse } from '#src/app/release/use-cases/deploy-release/deploy-release.response.js'
import { DeployReleaseUseCase } from '#src/app/release/use-cases/deploy-release/deploy-release.use-case.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { SESSION_COOKIE_SECURITY_SCHEME } from '#src/modules/swagger/build-api-documentation.js'

@ApiTags('releases')
@Controller({ path: 'releases/:uuid/deploy', version: '1' })
export class DeployReleaseController {
  constructor(private readonly usecase: DeployReleaseUseCase) {}

  @Post()
  @HttpCode(200)
  @Roles(UserRole.Operator, UserRole.Member)
  @ApiCookieAuth(SESSION_COOKIE_SECURITY_SCHEME)
  @ApiOkResponse({ type: DeployReleaseResponse })
  @ApiConflictResponse({ description: 'The release is not the app’s newest release.' })
  @ApiForbiddenResponse({ description: 'Your account is not approved for this action.' })
  @ApiNotFoundResponse({ description: 'No release with that uuid.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  @ApiInternalServerErrorResponse({
    description: 'Stored pull credentials could not be decrypted.',
  })
  handle(@Param('uuid', ParseUUIDPipe) uuid: string): Promise<DeployReleaseResponse> {
    return this.usecase.execute(uuid as ReleaseUuid)
  }
}
