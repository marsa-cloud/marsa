import { Controller, Get, Param, UseGuards } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { SessionAuthGuard } from '#src/app/auth/guards/session-auth.guard.js'
import { ViewReleaseIndexResponse } from '#src/app/release/use-cases/view-release-index/view-release-index.response.js'
import { ViewReleaseIndexUseCase } from '#src/app/release/use-cases/view-release-index/view-release-index.use-case.js'

@ApiTags('releases')
@Controller({ path: 'apps/:slug/releases', version: '1' })
export class ViewReleaseIndexController {
  constructor(private readonly usecase: ViewReleaseIndexUseCase) {}

  @Get()
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ operationId: 'viewReleaseIndexV1' })
  @ApiOkResponse({ type: ViewReleaseIndexResponse })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  handle(@Param('slug') slug: string): Promise<ViewReleaseIndexResponse> {
    return this.usecase.execute(slug)
  }
}
