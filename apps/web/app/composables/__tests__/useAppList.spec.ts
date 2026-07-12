import { describe, expect, it } from 'vitest'

import { zListAppsResponse } from '~/api/zod.gen'

describe('app-list response contract', () => {
  it('accepts a valid list payload', () => {
    const valid = {
      apps: [
        {
          slug: 'my-app',
          image: 'nginx:1.27',
          url: 'https://my-app.marsa.app',
          createdAt: '2026-07-10T10:00:00.000Z',
          updatedAt: '2026-07-10T10:01:00.000Z',
        },
      ],
    }
    expect(zListAppsResponse.parse(valid)).toEqual(valid)
  })

  it('accepts an empty list', () => {
    expect(zListAppsResponse.parse({ apps: [] })).toEqual({ apps: [] })
  })

  it('rejects an app missing required fields', () => {
    expect(() => zListAppsResponse.parse({ apps: [{ slug: 'x' }] })).toThrow()
  })
})
