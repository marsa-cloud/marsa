import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import { useCreateApp } from '../useCreateApp'

registerEndpoint('/api/v1/apps', {
  method: 'POST',
  handler: () => ({ slug: 'my-app', url: 'https://my-app.marsa.cc' }),
})

describe('useCreateApp.create', () => {
  it('POSTs the app and returns the contract-validated response', async () => {
    const { create } = useCreateApp()
    expect(await create({
      environmentUuid: '0190c3c0-0000-7000-8000-000000000002',
      slug: 'my-app',
      image: 'nginx:1.27',
      containerPort: 80,
    })).toEqual({
      slug: 'my-app',
      url: 'https://my-app.marsa.cc',
    })
  })
})
