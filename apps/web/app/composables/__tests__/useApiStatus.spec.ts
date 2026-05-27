import { describe, expect, it } from 'vitest'
import { zGetApiInfoResponse } from '~/api/zod.gen'

const validInfo = {
  name: 'marsa-api',
  version: '0.0.0',
  commit: null,
  nodeEnv: 'test',
  uptimeSeconds: 12,
}

describe('api status contract validation', () => {
  it('accepts a valid status payload', () => {
    expect(zGetApiInfoResponse.parse(validInfo)).toEqual(validInfo)
  })

  it('rejects a payload that violates the contract', () => {
    expect(() =>
      zGetApiInfoResponse.parse({ ...validInfo, uptimeSeconds: 'not-a-number' }),
    ).toThrow()
  })
})
