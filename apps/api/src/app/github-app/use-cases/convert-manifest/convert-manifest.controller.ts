import { Body, Controller, HttpCode, Post } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'

import { ConvertManifestCommand } from '#src/app/github-app/use-cases/convert-manifest/convert-manifest.command.js'
import { ConvertManifestResponse } from '#src/app/github-app/use-cases/convert-manifest/convert-manifest.response.js'
import { ConvertManifestUseCase } from '#src/app/github-app/use-cases/convert-manifest/convert-manifest.use-case.js'

@ApiTags('github-app')
@Controller({ path: 'github-app/conversions', version: '1' })
export class ConvertManifestController {
  constructor(private readonly usecase: ConvertManifestUseCase) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({ operationId: 'convertGithubAppManifestV1' })
  @ApiOkResponse({ type: ConvertManifestResponse })
  handle(@Body() body: ConvertManifestCommand): Promise<ConvertManifestResponse> {
    return this.usecase.execute(body)
  }
}
