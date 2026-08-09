import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'

import { useAppList } from '../useAppList'

const apps = {
  items: [
    {
      slug: 'my-app',
      image: 'ghcr.io/acme/my-app:v2',
      url: 'https://my-app.marsa.app',
      createdAt: '2026-07-10T10:00:00.000Z',
      updatedAt: '2026-07-10T10:01:00.000Z',
    },
  ],
  meta: { next: { uuid: '22222222-2222-4222-8222-222222222222' } },
}

registerEndpoint('/api/v1/apps', () => apps)

function mountComposable() {
  let result!: ReturnType<typeof useAppList>
  return mountSuspended(
    defineComponent({
      async setup() {
        result = useAppList()
        await result.reset()
        return () => h('div')
      },
    }),
  ).then(() => result)
}

describe('useAppList', () => {
  it('reads GET /v1/apps and returns the contract-validated list', async () => {
    const { items } = await mountComposable()
    expect(items.value).toEqual(apps.items)
  })
})
