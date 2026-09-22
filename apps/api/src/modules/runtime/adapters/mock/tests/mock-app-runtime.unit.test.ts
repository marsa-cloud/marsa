import { describe, it } from 'node:test'
import { expect } from 'expect'
import { MockAppRuntime } from '#src/modules/runtime/adapters/mock/mock-app-runtime.js'
import type { AppDeploySpec, AppRef } from '#src/modules/runtime/runtime.types.js'
import { generateUuid, type Uuid } from '#src/utils/uuid.js'

const APP: AppRef = {
  project: { slug: 'demo' },
  environment: { uuid: generateUuid<Uuid<'Environment'>>(), slug: 'dev' },
  app: { slug: 'my-app' },
}

const spec = (releaseUuid: Uuid<'Release'>): AppDeploySpec => ({
  releaseUuid,
  image: 'nginx:1.27',
  port: 80,
  env: {},
  minReplicas: 1,
  maxReplicas: 1,
  host: 'my-app.demo.marsa.cc',
  nodePin: null,
})

describe('MockAppRuntime.readLiveReleaseUuid', () => {
  it('reports the release it last deployed, like a real runtime would', async () => {
    const runtime = new MockAppRuntime()
    const first = generateUuid<Uuid<'Release'>>()
    const second = generateUuid<Uuid<'Release'>>()
    expect(await runtime.readLiveReleaseUuid(APP)).toBeNull()

    await runtime.deploy(APP, spec(first))
    await runtime.deploy(APP, spec(second))

    expect(await runtime.readLiveReleaseUuid(APP)).toBe(second)
  })

  it('forgets an app once it is destroyed', async () => {
    const runtime = new MockAppRuntime()
    await runtime.deploy(APP, spec(generateUuid<Uuid<'Release'>>()))

    await runtime.destroy(APP)

    expect(await runtime.readLiveReleaseUuid(APP)).toBeNull()
  })

  it('lets a test declare what is running without deploying anything', async () => {
    const runtime = new MockAppRuntime()
    const live = generateUuid<Uuid<'Release'>>()

    runtime.setLiveRelease('my-app', live)

    expect(await runtime.readLiveReleaseUuid(APP)).toBe(live)
  })
})

describe('MockAppRuntime.failNext', () => {
  it('fails the armed operation exactly once and leaves state untouched', async () => {
    const runtime = new MockAppRuntime()
    const release = generateUuid<Uuid<'Release'>>()
    runtime.failNext('deploy', new Error('cluster down'))

    await expect(runtime.deploy(APP, spec(release))).rejects.toThrow('cluster down')
    expect(await runtime.readLiveReleaseUuid(APP)).toBeNull()

    await runtime.deploy(APP, spec(release))
    expect(await runtime.readLiveReleaseUuid(APP)).toBe(release)
  })

  it('arms destroy independently of deploy', async () => {
    const runtime = new MockAppRuntime()
    runtime.failNext('destroy', new Error('cluster down'))

    await runtime.deploy(APP, spec(generateUuid<Uuid<'Release'>>()))
    await expect(runtime.destroy(APP)).rejects.toThrow('cluster down')
  })
})
