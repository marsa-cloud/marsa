import { Controller, Get } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'

import { GetManifestResponse } from '#src/app/github-app/use-cases/get-manifest/get-manifest.response.js'
import { GetManifestService } from '#src/app/github-app/use-cases/get-manifest/get-manifest.service.js'

@ApiTags('github-app')
@Controller({ path: 'github-app/manifest', version: '1' })
export class GetManifestController {
  constructor(private readonly service: GetManifestService) {}

  @Get()
  @ApiOperation({ operationId: 'getGithubAppManifestV1' })
  @ApiOkResponse({ type: GetManifestResponse })
  handle(): GetManifestResponse {
    return this.service.execute()
  }
}
