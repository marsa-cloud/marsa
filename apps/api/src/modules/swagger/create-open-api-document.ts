import type { INestApplication } from '@nestjs/common'
import type { OpenAPIObject } from '@nestjs/swagger'
import { SwaggerModule } from '@nestjs/swagger'

import { buildApiDocumentation } from '#src/modules/swagger/build-api-documentation.js'

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  return SwaggerModule.createDocument(app, buildApiDocumentation(process.env.VERSION ?? '1.0'))
}
