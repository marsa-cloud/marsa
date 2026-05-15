import { Injectable } from '@nestjs/common'

import type { GetApiInfoResponse } from '#src/modules/status/use-cases/get-api-info/get-api-info.response.js'

@Injectable()
export class GetApiInfoService {
  execute(): GetApiInfoResponse {
    return {
      name: 'marsa-api',
      version: process.env.VERSION ?? '0.0.0',
      commit: process.env.COMMIT ?? null,
      nodeEnv: process.env.NODE_ENV ?? 'development',
      uptimeSeconds: Math.round(process.uptime()),
    }
  }
}
