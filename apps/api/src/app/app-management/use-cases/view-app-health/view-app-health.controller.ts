import { Controller, Get, Param, UseGuards } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { ViewAppHealthResponse } from '#src/app/app-management/use-cases/view-app-health/view-app-health.response.js'
import { ViewAppHealthUseCase } from '#src/app/app-management/use-cases/view-app-health/view-app-health.use-case.js'
import { SessionAuthGuard } from '#src/app/auth/guards/session-auth.guard.js'

@ApiTags('apps')
@Controller({ path: 'apps/:slug/health', version: '1' })
export class ViewAppHealthController {
  constructor(private readonly usecase: ViewAppHealthUseCase) {}

  @Get()
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ operationId: 'viewAppHealthV1' })
  @ApiOkResponse({ type: ViewAppHealthResponse })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  handle(@Param('slug') slug: string): Promise<ViewAppHealthResponse> {
    return this.usecase.execute(slug)
  }
}
