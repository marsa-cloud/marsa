import { Controller, Get } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'

import { GetApiInfoResponse } from '#src/modules/status/use-cases/get-api-info/get-api-info.response.js'
import { GetApiInfoService } from '#src/modules/status/use-cases/get-api-info/get-api-info.service.js'

@ApiTags('status')
@Controller({ path: 'status', version: '1' })
export class GetApiInfoController {
  constructor(private readonly service: GetApiInfoService) {}

  @Get()
  @ApiOperation({ operationId: 'getApiInfoV1' })
  @ApiOkResponse({ type: GetApiInfoResponse })
  handle(): GetApiInfoResponse {
    return this.service.execute()
  }
}
