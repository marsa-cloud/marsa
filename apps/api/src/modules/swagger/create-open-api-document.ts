import type { INestApplication } from '@nestjs/common'
import type { OpenAPIObject } from '@nestjs/swagger'
import { SwaggerModule } from '@nestjs/swagger'

import { buildApiDocumentation } from '#src/modules/swagger/build-api-documentation.js'

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  // VERSION's default ('0.0.0') is owned by the global env schema (AgDR-0020) — by
  // the time this runs, `ConfigModule.forRoot` has already resolved it into
  // `process.env`, even in `generate-open-api.ts`'s preview-mode boot.
  return SwaggerModule.createDocument(app, buildApiDocumentation(process.env.VERSION ?? '0.0.0'))
}
