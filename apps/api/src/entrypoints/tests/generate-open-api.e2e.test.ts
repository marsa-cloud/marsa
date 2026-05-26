import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'

import type { INestApplication } from '@nestjs/common'
import { VersioningType } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { SwaggerModule } from '@nestjs/swagger'

import { ApiModule } from '#src/modules/api/api.module.js'
import { buildApiDocumentation } from '#src/modules/swagger/build-api-documentation.js'

describe('OpenAPI generation', () => {
  let app: INestApplication

  before(async () => {
    app = await NestFactory.create(ApiModule, { logger: false, preview: true })
    app.setGlobalPrefix('api')
    app.enableVersioning({ type: VersioningType.URI })
  })

  after(async () => {
    await app.close()
  })

  it('includes the versioned status path with a typed response', () => {
    const document = SwaggerModule.createDocument(app, buildApiDocumentation('1.0'))
    const statusGet = document.paths['/api/v1/status']?.get

    assert.ok(statusGet, 'expected /api/v1/status GET to be documented')
    assert.equal(statusGet.operationId, 'getApiInfoV1')

    const response200 = statusGet.responses['200'] as Record<string, any>
    const schemaRef = response200.content['application/json'].schema.$ref
    assert.equal(schemaRef, '#/components/schemas/GetApiInfoResponse')

    const schema = document.components?.schemas?.['GetApiInfoResponse'] as Record<string, any>
    assert.deepEqual(Object.keys(schema.properties).sort(), [
      'commit',
      'name',
      'nodeEnv',
      'uptimeSeconds',
      'version',
    ])
  })
})
