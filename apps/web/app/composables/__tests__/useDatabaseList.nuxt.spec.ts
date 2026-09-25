import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'

import { useDatabaseList } from '../useDatabaseList'

const databases = {
  items: [
    {
      slug: 'orders',
      engine: 'postgres',
      version: '17',
      status: 'ready',
      project: { slug: 'demo', name: 'Demo' },
      environment: { slug: 'dev', name: 'Dev' },
      createdAt: '2026-09-23T10:00:00.000Z',
      updatedAt: '2026-09-23T10:01:00.000Z',
    },
  ],
  meta: { next: { uuid: '22222222-2222-4222-8222-222222222222' } },
}

registerEndpoint('/api/v1/databases', () => databases)

function mountComposable() {
  let result!: ReturnType<typeof useDatabaseList>
  return mountSuspended(
    defineComponent({
      async setup() {
        result = useDatabaseList()
        await result.reset()
        return () => h('div')
      },
    }),
  ).then(() => result)
}

describe('useDatabaseList', () => {
  it('reads GET /v1/databases and returns the contract-validated list', async () => {
    const { items } = await mountComposable()
    expect(items.value).toEqual(databases.items)
  })
})
