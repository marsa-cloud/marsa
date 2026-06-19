import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import type { GetApiInfoResponse } from '#src/modules/status/use-cases/get-api-info/get-api-info.response.js'

@Injectable()
export class GetApiInfoService {
  constructor(private readonly config: ConfigService) {}

  execute(): GetApiInfoResponse {
    return {
      name: 'marsa-api',
      // VERSION/NODE_ENV carry Joi defaults (AgDR-0020) rather than `required()`,
      // so they're read via `get(key, default)` here to match outside of a booted
      // app (e.g. this service constructed with a bare `ConfigService()` in tests).
      version: this.config.get('VERSION', '0.0.0'),
      commit: this.config.get('COMMIT') ?? null,
      nodeEnv: this.config.get('NODE_ENV', 'development'),
      uptimeSeconds: Math.round(process.uptime()),
    }
  }
}
