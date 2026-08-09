import { describe, expect, it } from 'vitest'

import { zViewAppIndexResponse } from '~/api/zod.gen'

describe('app-list response contract', () => {
  it('accepts a valid list payload', () => {
    const valid = {
      items: [
        {
          slug: 'my-app',
          image: 'nginx:1.27',
          url: 'https://my-app.marsa.app',
          createdAt: '2026-07-10T10:00:00.000Z',
          updatedAt: '2026-07-10T10:01:00.000Z',
        },
      ],
      meta: { next: { uuid: '22222222-2222-4222-8222-222222222222' } },
    }
    expect(zViewAppIndexResponse.parse(valid)).toEqual(valid)
  })

  it('accepts an empty list', () => {
    expect(zViewAppIndexResponse.parse({ items: [], meta: { next: null } })).toEqual({
      items: [],
      meta: { next: null },
    })
  })

  it('rejects an app missing required fields', () => {
    expect(() => zViewAppIndexResponse.parse({ items: [{ slug: 'x' }], meta: { next: null } })).toThrow()
  })
})
