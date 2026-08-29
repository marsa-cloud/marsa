import { Controller, Get } from '@nestjs/common'
import { ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { Public } from '#src/app/auth/decorators/roles.decorator.js'
import { GetApiInfoResponse } from '#src/modules/status/use-cases/get-api-info/get-api-info.response.js'
import { GetApiInfoService } from '#src/modules/status/use-cases/get-api-info/get-api-info.service.js'

@ApiTags('status')
@Controller({ path: 'status', version: '1' })
export class GetApiInfoController {
  constructor(private readonly service: GetApiInfoService) {}

  @Get()
  @Public()
  @ApiOkResponse({ type: GetApiInfoResponse })
  handle(): GetApiInfoResponse {
    return this.service.execute()
  }
}
