import { describe, it } from 'node:test'
import { expect } from 'expect'
import { RELEASE_UUID_ANNOTATION } from '#src/modules/kubernetes/deploy-backend.constants.js'
import { InvalidReleaseAnnotationError } from '#src/modules/kubernetes/deploy-backend.js'
import type { RenderedManifests } from '#src/modules/kubernetes/deploy-backend.types.js'
import { MockDeployBackend } from '#src/modules/kubernetes/mock-deploy-backend.js'
import { generateUuid, type Uuid } from '#src/utils/uuid.js'

const R1 = generateUuid<Uuid<'Release'>>()
const R2 = generateUuid<Uuid<'Release'>>()
const R9 = generateUuid<Uuid<'Release'>>()

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

    await backend.apply('ns', manifests('my-app', R1))
    await backend.apply('ns', manifests('my-app', R2))

    expect(await backend.readLiveReleaseUuid('ns', 'my-app')).toBe(R2)
  })

  it('forgets an app once it is destroyed', async () => {
    const backend = new MockDeployBackend()
    await backend.apply('ns', manifests('my-app', R1))
    await backend.destroy('ns', 'my-app')

    expect(await backend.readLiveReleaseUuid('ns', 'my-app')).toBeNull()
  })

  it('lets a test declare what the cluster is running without applying anything', async () => {
    const backend = new MockDeployBackend()

    backend.setLiveRelease('my-app', R9)

    expect(await backend.readLiveReleaseUuid('ns', 'my-app')).toBe(R9)
  })

  it('refuses an annotation that is not a uuid, as the real backend does', async () => {
    const backend = new MockDeployBackend()
    backend.setLiveRelease('my-app', 'not-a-uuid')

    await expect(backend.readLiveReleaseUuid('ns', 'my-app')).rejects.toThrow(
      InvalidReleaseAnnotationError,
    )
  })
})
