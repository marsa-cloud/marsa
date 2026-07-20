import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'

import { useAppHealth, useAppReleases, useAppRunLogs } from '../useAppDetail'

const SLUG = 'my-app'

const releases = {
  releases: [
    {
      uuid: '11111111-1111-1111-1111-111111111111',
      imageRef: 'ghcr.io/acme/my-app:v2',
      triggeredBy: 'manual',
      deployStatus: 'succeeded',
      createdAt: '2026-07-10T10:00:00.000Z',
      updatedAt: '2026-07-10T10:01:00.000Z',
    },
  ],
}
const health = { status: 'healthy', availableReplicas: 2, desiredReplicas: 2 }
const runLogs = { podName: 'my-app-abc', logs: 'listening on :8080\n' }

registerEndpoint(`/api/v1/deployments/apps/${SLUG}/releases`, () => releases)
registerEndpoint(`/api/v1/deployments/apps/${SLUG}/health`, () => health)
registerEndpoint(`/api/v1/deployments/apps/${SLUG}/logs`, () => runLogs)

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
  it('useAppReleases reads the per-app releases endpoint', async () => {
    const { data } = await mountComposable(() => useAppReleases(SLUG))
    expect(data.value).toEqual(releases)
  })

  it('useAppHealth reads the per-app health endpoint', async () => {
    const { data } = await mountComposable(() => useAppHealth(SLUG))
    expect(data.value).toEqual(health)
  })

  it('useAppRunLogs reads the per-app logs endpoint', async () => {
    const { data } = await mountComposable(() => useAppRunLogs(SLUG))
    expect(data.value).toEqual(runLogs)
  })
})
