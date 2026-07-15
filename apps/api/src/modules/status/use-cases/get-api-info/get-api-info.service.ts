import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { GetApiInfoResponse } from '#src/modules/status/use-cases/get-api-info/get-api-info.response.js'

@Injectable()
export class GetApiInfoService {
  constructor(private readonly config: ConfigService) {}

  execute(): GetApiInfoResponse {
    return {
      name: 'marsa-api',
      version: this.config.get('VERSION', '0.0.0'),
      commit: this.config.get('COMMIT') ?? null,
      nodeEnv: this.config.get('NODE_ENV', 'development'),
      uptimeSeconds: Math.round(process.uptime()),
    }
  }
}
