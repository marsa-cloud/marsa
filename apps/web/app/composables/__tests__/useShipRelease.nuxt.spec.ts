import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { readBody } from 'h3'
import { describe, expect, it, vi } from 'vitest'

import { useShipRelease } from '../useShipRelease'

const RELEASE = '0199a1b2-0000-7000-8000-000000000002'
const OLD = '0199a1b2-0000-7000-8000-000000000001'

const createBody = vi.fn()
registerEndpoint('/api/v1/apps/my-app/releases', {
  method: 'POST',
  handler: async (event) => {
    createBody(await readBody(event))
    return { releaseUuid: RELEASE, appSlug: 'my-app', triggeredBy: 'manual', sourceReleaseUuid: null }
  },
})
registerEndpoint(`/api/v1/releases/${RELEASE}/deploy`, {
  method: 'POST',
  handler: () => ({
    releaseUuid: RELEASE,
    appSlug: 'my-app',
    url: 'https://my-app.marsa.cc',
    deployStatus: 'pending',
  }),
})

describe('useShipRelease.ship', () => {
  it('creates a release then deploys exactly that release', async () => {
    const { ship } = useShipRelease()

    const result = await ship('my-app')

    expect(createBody).toHaveBeenLastCalledWith({})
    expect(result).toEqual({
      releaseUuid: RELEASE,
      appSlug: 'my-app',
      url: 'https://my-app.marsa.cc',
      deployStatus: 'pending',
    })
  })

  it('passes the rollback source through to create-release', async () => {
    const { ship } = useShipRelease()

    await ship('my-app', { fromReleaseUuid: OLD })

    expect(createBody).toHaveBeenLastCalledWith({ fromReleaseUuid: OLD })
  })
})
