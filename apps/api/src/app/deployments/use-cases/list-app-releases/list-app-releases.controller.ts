import { Controller, Get, Param, UseGuards } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'

import { SessionAuthGuard } from '#src/app/auth/guards/session-auth.guard.js'
import { ListAppReleasesResponse } from '#src/app/deployments/use-cases/list-app-releases/list-app-releases.response.js'
import { ListAppReleasesUseCase } from '#src/app/deployments/use-cases/list-app-releases/list-app-releases.use-case.js'

@ApiTags('deployments')
@Controller({ path: 'deployments/apps/:slug/releases', version: '1' })
export class ListAppReleasesController {
  constructor(private readonly usecase: ListAppReleasesUseCase) {}

  @Get()
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ operationId: 'listAppReleasesV1' })
  @ApiOkResponse({ type: ListAppReleasesResponse })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  handle(@Param('slug') slug: string): Promise<ListAppReleasesResponse> {
    return this.usecase.execute(slug)
  }
}
