import { Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common'
import {
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { SessionAuthGuard } from '#src/app/auth/guards/session-auth.guard.js'
import { RedeployAppResponse } from '#src/app/release/use-cases/redeploy-app/redeploy-app.response.js'
import { RedeployAppUseCase } from '#src/app/release/use-cases/redeploy-app/redeploy-app.use-case.js'

@ApiTags('releases')
@Controller({ path: 'apps/:slug/redeploy', version: '1' })
export class RedeployAppController {
  constructor(private readonly usecase: RedeployAppUseCase) {}

  @Post()
  @HttpCode(200)
  @UseGuards(SessionAuthGuard)
  @ApiOkResponse({ type: RedeployAppResponse })
  @ApiNotFoundResponse({ description: 'No app with that slug.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  @ApiInternalServerErrorResponse({
    description: 'Stored image pull credentials could not be decrypted.',
  })
  handle(@Param('slug') slug: string): Promise<RedeployAppResponse> {
    return this.usecase.execute(slug)
  }
}
