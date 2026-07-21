import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { SessionAuthGuard } from '#src/app/auth/guards/session-auth.guard.js'
import { DeployAppCommand } from '#src/app/release/use-cases/deploy-app/deploy-app.command.js'
import { DeployAppResponse } from '#src/app/release/use-cases/deploy-app/deploy-app.response.js'
import { DeployAppUseCase } from '#src/app/release/use-cases/deploy-app/deploy-app.use-case.js'

@ApiTags('releases')
@Controller({ path: 'deploy', version: '1' })
export class DeployAppController {
  constructor(private readonly usecase: DeployAppUseCase) {}

  @Post()
  @HttpCode(200)
  @UseGuards(SessionAuthGuard)
  @ApiOkResponse({ type: DeployAppResponse })
  @ApiBadRequestResponse({ description: 'Malformed body, or an invalid slug / image / port.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  handle(@Body() body: DeployAppCommand): Promise<DeployAppResponse> {
    return this.usecase.execute(body)
  }
}
