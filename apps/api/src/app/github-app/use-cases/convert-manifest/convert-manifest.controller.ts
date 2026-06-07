import { Body, Controller, HttpCode, Post } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'

import { ConvertManifestRequest } from '#src/app/github-app/use-cases/convert-manifest/convert-manifest.request.js'
import { ConvertManifestResponse } from '#src/app/github-app/use-cases/convert-manifest/convert-manifest.response.js'
import { ConvertManifestService } from '#src/app/github-app/use-cases/convert-manifest/convert-manifest.service.js'

@ApiTags('github-app')
@Controller({ path: 'github-app/conversions', version: '1' })
export class ConvertManifestController {
  constructor(private readonly service: ConvertManifestService) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({ operationId: 'convertGithubAppManifestV1' })
  @ApiOkResponse({ type: ConvertManifestResponse })
  handle(@Body() body: ConvertManifestRequest): Promise<ConvertManifestResponse> {
    return this.service.execute(body)
  }
}
