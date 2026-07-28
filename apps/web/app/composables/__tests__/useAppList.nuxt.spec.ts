import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'

import { useAppList } from '../useAppList'

const apps = {
  apps: [
    {
      slug: 'my-app',
      image: 'ghcr.io/acme/my-app:v2',
      url: 'https://my-app.marsa.app',
      createdAt: '2026-07-10T10:00:00.000Z',
      updatedAt: '2026-07-10T10:01:00.000Z',
    },
  ],
}

registerEndpoint('/api/v1/apps', () => apps)

function mountComposable() {
  let result!: ReturnType<typeof useAppList>
  return mountSuspended(
    defineComponent({
      async setup() {
        result = useAppList()
        await result
        return () => h('div')
      },
    }),
  ).then(() => result)
}

describe('useAppList', () => {
  it('reads GET /v1/apps and returns the contract-validated list', async () => {
    const { data } = await mountComposable()
    expect(data.value).toEqual(apps)
  })
})
