import { Controller, Get } from '@nestjs/common'

import type { GetApiInfoResponse } from '#src/modules/status/use-cases/get-api-info/get-api-info.response.js'
import { GetApiInfoService } from '#src/modules/status/use-cases/get-api-info/get-api-info.service.js'

@Controller({ path: 'status', version: '1' })
export class GetApiInfoController {
  constructor(private readonly service: GetApiInfoService) {}

  @Get()
  handle(): GetApiInfoResponse {
    return this.service.execute()
  }
}
