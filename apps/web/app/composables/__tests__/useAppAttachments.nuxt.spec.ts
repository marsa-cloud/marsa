import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'

import { useAppAttachments } from '../useAppAttachments'

const attachments = {
  items: [
    {
      databaseSlug: 'orders',
      alias: null,
      engine: 'postgres',
      version: '17',
      variables: ['DATABASE_URL', 'PGHOST'],
    },
  ],
}

registerEndpoint('/api/v1/apps/my-app/attachments', () => attachments)

function mountComposable() {
  let result!: ReturnType<typeof useAppAttachments>
  return mountSuspended(
    defineComponent({
      async setup() {
        result = useAppAttachments('my-app')
        await result.refresh()
        return () => h('div')
      },
    }),
  ).then(() => result)
}

describe('useAppAttachments', () => {
  it('reads the app attachments and returns the contract-validated list', async () => {
    const { data } = await mountComposable()

    expect(data.value?.items).toEqual(attachments.items)
  })
})
