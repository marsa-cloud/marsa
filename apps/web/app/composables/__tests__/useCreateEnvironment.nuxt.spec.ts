import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import { useCreateEnvironment } from '../useCreateEnvironment'

const created = {
  uuid: '0190c3c0-0000-7000-8000-000000000002',
  name: 'Dev',
  slug: 'dev',
  namespace: 'demo-dev',
  projectSlug: 'demo',
}

registerEndpoint('/api/v1/projects/demo/environments', { method: 'POST', handler: () => created })

describe('useCreateEnvironment.create', () => {
  it('POSTs the environment under its project', async () => {
    expect(await useCreateEnvironment().create('demo', { name: 'Dev', slug: 'dev' })).toEqual(
      created,
    )
  })
})
