import { Controller, Get, Param } from '@nestjs/common'
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { Roles } from '#src/app/auth/decorators/roles.decorator.js'
import { ViewAppAttachmentIndexResponse } from '#src/app/database-management/use-cases/view-app-attachment-index/view-app-attachment-index.response.js'
import { ViewAppAttachmentIndexUseCase } from '#src/app/database-management/use-cases/view-app-attachment-index/view-app-attachment-index.use-case.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { SESSION_COOKIE_SECURITY_SCHEME } from '#src/modules/swagger/build-api-documentation.js'

@ApiTags('databases')
@Controller({ path: 'apps/:slug/attachments', version: '1' })
export class ViewAppAttachmentIndexController {
  constructor(private readonly usecase: ViewAppAttachmentIndexUseCase) {}

  @Get()
  @Roles(UserRole.Operator, UserRole.Member)
  @ApiCookieAuth(SESSION_COOKIE_SECURITY_SCHEME)
  @ApiOkResponse({ type: ViewAppAttachmentIndexResponse })
  @ApiNotFoundResponse({ description: 'No app with that slug.' })
  @ApiForbiddenResponse({ description: 'Your account is not approved for this action.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  handle(@Param('slug') slug: string): Promise<ViewAppAttachmentIndexResponse> {
    return this.usecase.execute(slug)
  }
}
