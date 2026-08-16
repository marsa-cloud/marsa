import type { LocationQuery } from 'vue-router'
import { describe, expect, it } from 'vitest'

import { parseGithubDenial, resolveGithubLoginQuery } from '../useGithubCallback'

describe('parseGithubDenial', () => {
  it('maps access_denied to a cancellation', () => {
    expect(parseGithubDenial({ error: 'access_denied' } as LocationQuery)).toBe('cancelled')
  })

  it('maps any other error code to a declined request', () => {
    expect(parseGithubDenial({ error: 'application_suspended' } as LocationQuery)).toBe('declined')
  })

  it('returns null when the query carries no error', () => {
    expect(parseGithubDenial({ code: 'c', state: 's' } as LocationQuery)).toBeNull()
  })
})

describe('resolveGithubLoginQuery', () => {
  it('proceeds when code and state are present', () => {
    expect(resolveGithubLoginQuery({ code: 'c', state: 's' } as LocationQuery)).toEqual({
      status: 'proceed',
      code: 'c',
      state: 's',
    })
  })

  it('short-circuits on a denial before looking for code and state', () => {
    expect(resolveGithubLoginQuery({ error: 'access_denied' } as LocationQuery)).toEqual({
      status: 'cancelled',
    })
  })

  it('fails when code or state is missing', () => {
    expect(resolveGithubLoginQuery({ state: 's' } as LocationQuery)).toEqual({ status: 'failed' })
    expect(resolveGithubLoginQuery({} as LocationQuery)).toEqual({ status: 'failed' })
  })
})
