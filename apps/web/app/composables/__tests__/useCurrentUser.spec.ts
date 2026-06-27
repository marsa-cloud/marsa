import { describe, expect, it } from 'vitest'
import { zGetCurrentUserResponse } from '~/api/zod.gen'

const validUser = { id: 'user-1', login: 'octocat', role: 'operator' }

describe('GetCurrentUserResponse contract', () => {
  it('accepts a valid user payload', () => {
    expect(zGetCurrentUserResponse.parse(validUser)).toEqual(validUser)
  })

  it('rejects a payload missing login', () => {
    expect(() => zGetCurrentUserResponse.parse({ id: 'user-1', role: 'operator' })).toThrow()
  })

  it('rejects a payload missing id', () => {
    expect(() => zGetCurrentUserResponse.parse({ login: 'octocat', role: 'operator' })).toThrow()
  })

  it('rejects an unknown role', () => {
    expect(() =>
      zGetCurrentUserResponse.parse({ id: 'user-1', login: 'octocat', role: 'superadmin' }),
    ).toThrow()
  })
})
