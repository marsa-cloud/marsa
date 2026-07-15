import { Controller, Get, Param, UseGuards } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { SessionAuthGuard } from '#src/app/auth/guards/session-auth.guard.js'
import { GetAppHealthResponse } from '#src/app/deployments/use-cases/get-app-health/get-app-health.response.js'
import { GetAppHealthUseCase } from '#src/app/deployments/use-cases/get-app-health/get-app-health.use-case.js'

@ApiTags('deployments')
@Controller({ path: 'deployments/apps/:slug/health', version: '1' })
export class GetAppHealthController {
  constructor(private readonly usecase: GetAppHealthUseCase) {}

  @Get()
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ operationId: 'getAppHealthV1' })
  @ApiOkResponse({ type: GetAppHealthResponse })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  handle(@Param('slug') slug: string): Promise<GetAppHealthResponse> {
    return this.usecase.execute(slug)
  }
}
