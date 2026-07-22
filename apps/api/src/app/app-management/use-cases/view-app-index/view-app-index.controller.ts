import { Controller, Get, UseGuards } from '@nestjs/common'
import { ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { ViewAppIndexResponse } from '#src/app/app-management/use-cases/view-app-index/view-app-index.response.js'
import { ViewAppIndexUseCase } from '#src/app/app-management/use-cases/view-app-index/view-app-index.use-case.js'
import { SessionAuthGuard } from '#src/app/auth/guards/session-auth.guard.js'

@ApiTags('apps')
@Controller({ path: 'apps', version: '1' })
export class ViewAppIndexController {
  constructor(private readonly usecase: ViewAppIndexUseCase) {}

  @Get()
  @UseGuards(SessionAuthGuard)
  @ApiOkResponse({ type: ViewAppIndexResponse })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  handle(): Promise<ViewAppIndexResponse> {
    return this.usecase.execute()
  }
}
