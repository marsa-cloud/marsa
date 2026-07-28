import { describe, expect, it } from 'vitest'
import { zViewMeResponse } from '~/api/zod.gen'

const validUser = { id: 'user-1', login: 'octocat', role: 'operator' }

describe('ViewMeResponse contract', () => {
  it('accepts a valid user payload', () => {
    expect(zViewMeResponse.parse(validUser)).toEqual(validUser)
  })

  it('rejects a payload missing login', () => {
    expect(() => zViewMeResponse.parse({ id: 'user-1', role: 'operator' })).toThrow()
  })

  it('rejects a payload missing id', () => {
    expect(() => zViewMeResponse.parse({ login: 'octocat', role: 'operator' })).toThrow()
  })

  it('rejects an unknown role', () => {
    expect(() =>
      zViewMeResponse.parse({ id: 'user-1', login: 'octocat', role: 'superadmin' }),
    ).toThrow()
  })
})
