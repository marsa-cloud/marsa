import { after, before, describe, it } from 'node:test'
import { expect } from 'expect'
import { createOpenApiDocument } from '#src/modules/swagger/create-open-api-document.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

describe('OpenAPI generation', () => {
  let setup: TestSetup

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
  })

  after(async () => {
    await setup.teardown()
  })

  it('includes the versioned status path with a typed response', () => {
    const document = createOpenApiDocument(setup.app)
    const statusGet = document.paths['/api/v1/status']?.get

    expect(statusGet).toBeDefined()
    expect(statusGet?.operationId).toBe('getApiInfoV1')

    const response200 = statusGet?.responses['200'] as Record<string, any>
    const schemaRef = response200.content['application/json'].schema.$ref
    expect(schemaRef).toBe('#/components/schemas/GetApiInfoResponse')

    const schema = document.components?.schemas?.['GetApiInfoResponse'] as Record<string, any>
    expect(Object.keys(schema.properties).sort()).toEqual([
      'commit',
      'name',
      'nodeEnv',
      'uptimeSeconds',
      'version',
    ])
  })

  it('auto-derives version-suffixed operationIds from the controller class name', () => {
    const document = createOpenApiDocument(setup.app)

    // Derived, not hand-written: class name minus `Controller`, camel-cased, + `V1`.
    expect(document.paths['/api/v1/status']?.get?.operationId).toBe('getApiInfoV1')
    // github-app endpoints now derive from the class name (GetManifestController ->
    // getManifestV1), deliberately dropping the former hand-written `GithubApp` infix.
    expect(document.paths['/api/v1/github-app/manifest']?.get?.operationId).toBe('getManifestV1')
  })
})
