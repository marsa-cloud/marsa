import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { getQuery } from 'h3'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'

import { useAppDetail, useAppHealth, useAppReleases, useAppRunLogs } from '../useAppDetail'

const SLUG = 'my-app'

const RELEASE_UUID = '11111111-1111-4111-8111-111111111111'
const releases = {
  items: [
    {
      uuid: RELEASE_UUID,
      imageRef: 'ghcr.io/acme/my-app:v2',
      triggeredBy: 'manual',
      deployStatus: 'succeeded',
      createdAt: '2026-07-10T10:00:00.000Z',
      updatedAt: '2026-07-10T10:01:00.000Z',
    },
  ],
  meta: { next: { uuid: RELEASE_UUID } },
}
const health = { status: 'healthy', availableReplicas: 2, desiredReplicas: 2 }
const runLogs = { podName: 'my-app-abc', logs: 'listening on :8080\n' }
const detail = {
  slug: SLUG,
  image: 'nginx:1.27',
  url: 'https://my-app.marsa.cc',
  containerPort: 80,
  replicas: 1,
  env: { LOG_LEVEL: 'info' },
  createdAt: '2026-07-10T10:00:00.000Z',
  updatedAt: '2026-07-10T10:01:00.000Z',
}

const logsQuery = vi.fn()

registerEndpoint(`/api/v1/apps/${SLUG}/releases`, () => releases)
registerEndpoint(`/api/v1/apps/${SLUG}/health`, () => health)
registerEndpoint(`/api/v1/apps/${SLUG}/logs`, (event) => {
  logsQuery(getQuery(event))
  return runLogs
})
registerEndpoint(`/api/v1/apps/${SLUG}`, () => detail)

function mountComposable<T>(run: () => T) {
  let result!: T
  return mountSuspended(
    defineComponent({
      async setup() {
        result = run()
        await result
        return () => h('div')
      },
    }),
  ).then(() => result)
}

describe('useAppDetail read composables', () => {
  it('useAppReleases accumulates the per-app releases endpoint', async () => {
    const list = await mountComposable(() => useAppReleases(SLUG))
    await list.reset()
    expect(list.items.value).toEqual(releases.items)
  })

  it('useAppHealth reads the per-app health endpoint', async () => {
    const { data } = await mountComposable(() => useAppHealth(SLUG))
    expect(data.value).toEqual(health)
  })

  it('useAppRunLogs reads the per-app logs endpoint with the requested tailLines', async () => {
    const { data } = await mountComposable(() => useAppRunLogs(SLUG, ref(250)))
    expect(data.value).toEqual(runLogs)
    expect(logsQuery).toHaveBeenCalledWith(expect.objectContaining({ tailLines: '250' }))
  })

  it('useAppDetail reads the per-app detail endpoint', async () => {
    const { data } = await mountComposable(() => useAppDetail(SLUG))
    expect(data.value).toEqual(detail)
  })
})
