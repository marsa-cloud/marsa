import { after, before, describe, it } from 'node:test'
import { expect } from 'expect'
import request from 'supertest'
import { ConvertManifestCommandBuilder } from '#src/app/github-app/use-cases/convert-manifest/convert-manifest.command.builder.js'
import { TestBench } from '#src/test/setup/test-bench.js'
import { TestSetup } from '#src/test/setup/test-setup.js'

describe('POST /api/v1/github-app/convert-manifest (e2e)', () => {
  let setup: TestSetup

  before(async () => {
    setup = await TestBench.setupEndToEndTest()
  })

  after(async () => {
    await setup.teardown()
  })

  it('rejects an invalid state with 400 (no GitHub call)', async () => {
    const response = await request(setup.httpServer)
      .post('/api/v1/github-app/convert-manifest')
      .send({ code: 'whatever', state: 'invalid' })
      .expect(400)

    expect(response.body.message).toMatch(/state/)
  })

  it('rejects an empty code with 400 (message mentions code) even when state is valid', async () => {
    const manifest = await request(setup.httpServer).get('/api/v1/github-app/manifest').expect(200)

    const response = await request(setup.httpServer)
      .post('/api/v1/github-app/convert-manifest')
      .send(new ConvertManifestCommandBuilder().withCode('').withState(manifest.body.state).build())
      .expect(400)

    // ValidationPipe returns `message` as a string[]; the manual guard returns a
    // string — String(...) normalises both so the assertion holds either way.
    expect(String(response.body.message)).toMatch(/code/)
  })
})
