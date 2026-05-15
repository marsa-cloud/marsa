import { Module } from '@nestjs/common'

import { GetApiInfoController } from '#src/modules/status/use-cases/get-api-info/get-api-info.controller.js'
import { GetApiInfoService } from '#src/modules/status/use-cases/get-api-info/get-api-info.service.js'

@Module({
  controllers: [GetApiInfoController],
  providers: [GetApiInfoService],
})
export class GetApiInfoModule {}
