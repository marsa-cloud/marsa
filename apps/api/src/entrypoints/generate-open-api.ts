import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { Logger, VersioningType } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { ApiModule } from '#src/modules/api/api.module.js'
import { createOpenApiDocument } from '#src/modules/swagger/create-open-api-document.js'

const OUTPUT_PATH = resolve(process.cwd(), 'openapi.json')

async function generateOpenApi(): Promise<void> {
  const app = await NestFactory.create(ApiModule, {
    logger: ['error', 'warn'],
    preview: true,
  })

  try {
    app.setGlobalPrefix('api')
    app.enableVersioning({ type: VersioningType.URI })

    const document = createOpenApiDocument(app)

    mkdirSync(dirname(OUTPUT_PATH), { recursive: true })
    writeFileSync(OUTPUT_PATH, `${JSON.stringify(document, null, 2)}\n`)
    Logger.log(`Generated OpenAPI document: ${OUTPUT_PATH}`)
  } finally {
    await app.close()
  }
}

generateOpenApi().catch((error) => {
  Logger.error('Failed to generate OpenAPI document', error)
  process.exitCode = 1
})
