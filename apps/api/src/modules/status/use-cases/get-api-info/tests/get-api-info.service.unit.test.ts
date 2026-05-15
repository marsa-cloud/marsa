import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'

import { GetApiInfoService } from '#src/modules/status/use-cases/get-api-info/get-api-info.service.js'
import { TestBench } from '#src/test/setup/test-bench.js'

describe('GetApiInfoService', () => {
  before(() => TestBench.setupUnitTest())

  it('returns api info with expected shape', () => {
    const service = new GetApiInfoService()

    const result = service.execute()

    assert.equal(result.name, 'marsa-api')
    assert.equal(typeof result.version, 'string')
    assert.equal(typeof result.nodeEnv, 'string')
    assert.equal(typeof result.uptimeSeconds, 'number')
    assert.ok(result.uptimeSeconds >= 0)
    assert.ok(result.commit === null || typeof result.commit === 'string')
  })
})
