import { describe, expect, it } from 'vitest'

import { repoSlug } from '../repoSlug'

describe('repoSlug', () => {
  it('uses the repo name, lowercased', () => {
    expect(repoSlug('Acme/My-Shop')).toBe('my-shop')
  })

  it('turns anything outside [a-z0-9-] into single hyphens and trims them', () => {
    expect(repoSlug('acme/.my__shop.v2.')).toBe('my-shop-v2')
  })

  it('stays within 63 characters without a trailing hyphen', () => {
    const slug = repoSlug(`acme/${'a'.repeat(62)}-b`)
    expect(slug.length).toBeLessThanOrEqual(63)
    expect(slug.endsWith('-')).toBe(false)
  })
})
