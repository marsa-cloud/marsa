import { Body, Controller, HttpCode, Post } from '@nestjs/common'
import { ApiBadRequestResponse, ApiOkResponse, ApiResponse, ApiTags } from '@nestjs/swagger'
import { ConvertManifestCommand } from '#src/app/github-app/use-cases/convert-manifest/convert-manifest.command.js'
import { ConvertManifestResponse } from '#src/app/github-app/use-cases/convert-manifest/convert-manifest.response.js'
import { ConvertManifestUseCase } from '#src/app/github-app/use-cases/convert-manifest/convert-manifest.use-case.js'

@ApiTags('github-app')
@Controller({ path: 'github-app/convert-manifest', version: '1' })
export class ConvertManifestController {
  constructor(private readonly usecase: ConvertManifestUseCase) {}

  @Post()
  @HttpCode(200)
  @ApiOkResponse({ type: ConvertManifestResponse })
  @ApiBadRequestResponse({ description: 'Malformed body, or an invalid/expired state token.' })
  @ApiResponse({ status: 502, description: 'GitHub App creation failed upstream at GitHub.' })
  handle(@Body() body: ConvertManifestCommand): Promise<ConvertManifestResponse> {
    return this.usecase.execute(body)
  }
}
