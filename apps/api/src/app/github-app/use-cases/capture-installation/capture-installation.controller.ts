import { Body, Controller, HttpCode, Post } from '@nestjs/common'
import {
  ApiBadGatewayResponse,
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger'
import { CaptureInstallationCommand } from '#src/app/github-app/use-cases/capture-installation/capture-installation.command.js'
import { CaptureInstallationResponse } from '#src/app/github-app/use-cases/capture-installation/capture-installation.response.js'
import { CaptureInstallationUseCase } from '#src/app/github-app/use-cases/capture-installation/capture-installation.use-case.js'

@ApiTags('github-app')
@Controller({ path: 'github-app/capture-installation', version: '1' })
export class CaptureInstallationController {
  constructor(private readonly usecase: CaptureInstallationUseCase) {}

  @Post()
  @HttpCode(200)
  @ApiOkResponse({ type: CaptureInstallationResponse })
  @ApiBadRequestResponse({
    description: 'Malformed body, an unsupported setup_action, or no provisioned App.',
  })
  @ApiBadGatewayResponse({ description: 'The installation could not be verified with GitHub.' })
  handle(@Body() body: CaptureInstallationCommand): Promise<CaptureInstallationResponse> {
    return this.usecase.execute(body)
  }
}
