import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import { useCreateProject } from '../useCreateProject'

const created = { uuid: '0190c3c0-0000-7000-8000-000000000001', name: 'Demo', slug: 'demo' }

registerEndpoint('/api/v1/projects', { method: 'POST', handler: () => created })

describe('useCreateProject.create', () => {
  it('POSTs the project and returns the validated response', async () => {
    expect(await useCreateProject().create({ name: 'Demo', slug: 'demo' })).toEqual(created)
  })
})
