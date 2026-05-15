import { Module } from '@nestjs/common'

import { GetApiInfoModule } from '#src/modules/status/use-cases/get-api-info/get-api-info.module.js'

@Module({
  imports: [GetApiInfoModule],
})
export class StatusModule {}
