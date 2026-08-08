import { Body, Controller, Param, Put, UseGuards } from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { UpdateAppEnvCommand } from '#src/app/app-management/use-cases/update-app-env/update-app-env.command.js'
import { UpdateAppEnvResponse } from '#src/app/app-management/use-cases/update-app-env/update-app-env.response.js'
import { UpdateAppEnvUseCase } from '#src/app/app-management/use-cases/update-app-env/update-app-env.use-case.js'
import { SessionAuthGuard } from '#src/app/auth/guards/session-auth.guard.js'

@ApiTags('apps')
@Controller({ path: 'apps/:slug/env', version: '1' })
export class UpdateAppEnvController {
  constructor(private readonly usecase: UpdateAppEnvUseCase) {}

  @Put()
  @UseGuards(SessionAuthGuard)
  @ApiOkResponse({ type: UpdateAppEnvResponse })
  @ApiBadRequestResponse({ description: 'env is not an object of string values with valid keys.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  @ApiNotFoundResponse({ description: 'No app with that slug.' })
  handle(
    @Param('slug') slug: string,
    @Body() command: UpdateAppEnvCommand,
  ): Promise<UpdateAppEnvResponse> {
    return this.usecase.execute(slug, command)
  }
}
