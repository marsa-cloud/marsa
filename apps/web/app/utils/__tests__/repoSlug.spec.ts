import { describe, expect, it } from 'vitest'

import { repoSlug } from '../repoSlug'

const DNS_1035 = /^[a-z]([-a-z0-9]*[a-z0-9])?$/

describe('repoSlug', () => {
  it('uses the repo name, lowercased', () => {
    expect(repoSlug('Acme/My-Shop')).toBe('my-shop')
  })

  it('turns anything outside [a-z0-9-] into single hyphens and trims them', () => {
    expect(repoSlug('acme/.my__shop.v2.')).toBe('my-shop-v2')
  })

  it('collapses repeated hyphens', () => {
    expect(repoSlug('acme/my---shop')).toBe('my-shop')
  })

  it('drops a leading digit run so the slug starts with a letter', () => {
    expect(repoSlug('acme/3d-viewer')).toBe('d-viewer')
    expect(repoSlug('acme/2024-report')).toBe('report')
  })

  it('prefixes app- when the name has no letter to start from', () => {
    expect(repoSlug('acme/2048')).toBe('app-2048')
    expect(repoSlug('acme/1-2-3')).toBe('app-1-2-3')
  })

  it('returns empty when nothing usable is left', () => {
    expect(repoSlug('acme/___')).toBe('')
    expect(repoSlug('')).toBe('')
  })

  it('stays within 63 characters without a trailing hyphen', () => {
    expect(repoSlug(`acme/${'a'.repeat(62)}-b`)).toBe('a'.repeat(62))
  })

  it.each(['acme/My-Shop', 'acme/3d-viewer', 'acme/2048', 'acme/-x-', `acme/9${'a-'.repeat(40)}`])(
    'yields a slug the create form accepts for %s',
    (fullName) => {
      const slug = repoSlug(fullName)
      expect(slug).toMatch(DNS_1035)
      expect(slug.length).toBeLessThanOrEqual(63)
    },
  )
})
