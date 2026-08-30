import { Controller, Get, Param } from '@nestjs/common'
import { ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { Roles } from '#src/app/auth/decorators/roles.decorator.js'
import { ViewReleaseIndexResponse } from '#src/app/release/use-cases/view-release-index/view-release-index.response.js'
import { ViewReleaseIndexUseCase } from '#src/app/release/use-cases/view-release-index/view-release-index.use-case.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'

@ApiTags('releases')
@Controller({ path: 'apps/:slug/releases', version: '1' })
export class ViewReleaseIndexController {
  constructor(private readonly usecase: ViewReleaseIndexUseCase) {}

  @Get()
  @Roles(UserRole.Operator, UserRole.Member)
  @ApiOkResponse({ type: ViewReleaseIndexResponse })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  handle(@Param('slug') slug: string): Promise<ViewReleaseIndexResponse> {
    return this.usecase.execute(slug)
  }
}
