import { describe, expect, it } from 'vitest'
import { zGetCurrentUserResponse } from '~/api/zod.gen'

const validUser = { id: 'user-1', login: 'octocat' }

describe('GetCurrentUserResponse contract', () => {
  it('accepts a valid user payload', () => {
    expect(zGetCurrentUserResponse.parse(validUser)).toEqual(validUser)
  })

  it('rejects a payload missing login', () => {
    expect(() => zGetCurrentUserResponse.parse({ id: 'user-1' })).toThrow()
  })

  it('rejects a payload missing id', () => {
    expect(() => zGetCurrentUserResponse.parse({ login: 'octocat' })).toThrow()
  })
})
