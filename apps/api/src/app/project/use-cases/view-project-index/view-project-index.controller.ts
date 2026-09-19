import { Controller, Get, Query } from '@nestjs/common'
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { Roles } from '#src/app/auth/decorators/roles.decorator.js'
import { ViewProjectIndexQuery } from '#src/app/project/use-cases/view-project-index/query/view-project-index.query.js'
import { ViewProjectIndexResponse } from '#src/app/project/use-cases/view-project-index/view-project-index.response.js'
import { ViewProjectIndexUseCase } from '#src/app/project/use-cases/view-project-index/view-project-index.use-case.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { SESSION_COOKIE_SECURITY_SCHEME } from '#src/modules/swagger/build-api-documentation.js'

@ApiTags('projects')
@Controller({ path: 'projects', version: '1' })
export class ViewProjectIndexController {
  constructor(private readonly usecase: ViewProjectIndexUseCase) {}

  @Get()
  @Roles(UserRole.Operator, UserRole.Member)
  @ApiCookieAuth(SESSION_COOKIE_SECURITY_SCHEME)
  @ApiOkResponse({ type: ViewProjectIndexResponse })
  @ApiForbiddenResponse({ description: 'Your account is not approved for this action.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  handle(@Query() query: ViewProjectIndexQuery): Promise<ViewProjectIndexResponse> {
    return this.usecase.execute(query)
  }
}
