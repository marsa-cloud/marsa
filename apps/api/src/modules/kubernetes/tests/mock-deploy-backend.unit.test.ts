import { describe, it } from 'node:test'
import { expect } from 'expect'
import { RELEASE_UUID_ANNOTATION } from '#src/modules/kubernetes/deploy-backend.constants.js'
import type { RenderedManifests } from '#src/modules/kubernetes/deploy-backend.types.js'
import { MockDeployBackend } from '#src/modules/kubernetes/mock-deploy-backend.js'

const manifests = (name: string, releaseUuid: string) =>
  ({
    deployment: {
      metadata: { name },
      spec: {
        selector: {},
        template: { metadata: { annotations: { [RELEASE_UUID_ANNOTATION]: releaseUuid } } },
      },
    },
  }) as unknown as RenderedManifests

describe('MockDeployBackend.readLiveReleaseUuid', () => {
  it('reports the release it last applied, like a real cluster would', async () => {
    const backend = new MockDeployBackend()
    expect(await backend.readLiveReleaseUuid('ns', 'my-app')).toBeNull()

    await backend.apply('ns', manifests('my-app', 'r-1'))
    await backend.apply('ns', manifests('my-app', 'r-2'))

    expect(await backend.readLiveReleaseUuid('ns', 'my-app')).toBe('r-2')
  })

  it('forgets an app once it is destroyed', async () => {
    const backend = new MockDeployBackend()
    await backend.apply('ns', manifests('my-app', 'r-1'))
    await backend.destroy('ns', 'my-app')

    expect(await backend.readLiveReleaseUuid('ns', 'my-app')).toBeNull()
  })

  it('lets a test declare what the cluster is running without applying anything', async () => {
    const backend = new MockDeployBackend()

    backend.setLiveRelease('my-app', 'r-9')

    expect(await backend.readLiveReleaseUuid('ns', 'my-app')).toBe('r-9')
  })
})
