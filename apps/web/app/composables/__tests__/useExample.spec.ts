import { describe, expect, it } from 'vitest'

import { useExample } from '../useExample'

describe('useExample', () => {
  it('returns the doubled value', () => {
    expect(useExample(2)).toBe(4)
  })

  it('returns 0 for 0', () => {
    expect(useExample(0)).toBe(0)
  })
})
