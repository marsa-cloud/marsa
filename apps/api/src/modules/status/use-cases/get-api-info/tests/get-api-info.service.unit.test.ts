import { before, describe, it } from 'node:test'
import { ConfigService } from '@nestjs/config'
import { expect } from 'expect'
import { GetApiInfoService } from '#src/modules/status/use-cases/get-api-info/get-api-info.service.js'
import { TestBench } from '#src/test/setup/test-bench.js'

describe('GetApiInfoService', () => {
  before(() => TestBench.setupUnitTest())

  it('returns api info with expected shape', () => {
    const service = new GetApiInfoService(new ConfigService())

    const result = service.execute()

    expect(result.name).toBe('marsa-api')
    expect(typeof result.version).toBe('string')
    expect(typeof result.nodeEnv).toBe('string')
    expect(typeof result.uptimeSeconds).toBe('number')
    expect(result.uptimeSeconds).toBeGreaterThanOrEqual(0)
    expect(result.commit === null || typeof result.commit === 'string').toBe(true)
  })
})
