import { describe, it } from 'node:test'
import { expect } from 'expect'
import { MockBuildRuntime } from '#src/modules/runtime/adapters/mock/mock-build-runtime.js'
import { type BuildRef, type BuildSpec, BuildState } from '#src/modules/runtime/runtime.types.js'
import { generateUuid, type Uuid } from '#src/utils/uuid.js'

const ref = (): BuildRef => ({ build: { uuid: generateUuid<Uuid<'Build'>>() }, app: { slug: 'a' } })
const spec: BuildSpec = {
  repoUrl: 'https://github.com/o/r.git',
  commitSha: 'a'.repeat(40),
  rootDir: '.',
  dockerfilePath: 'Dockerfile',
  gitToken: 't',
  pushRef: 'r:5000/a:x',
}

describe('MockBuildRuntime', () => {
  it('reports a started build as succeeded and an unknown one as not found', async () => {
    const runtime = new MockBuildRuntime()
    const started = ref()
    await runtime.start(started, spec)

    expect(await runtime.readStatus(started)).toEqual({ state: BuildState.Succeeded })
    expect(await runtime.readStatus(ref())).toEqual({ state: BuildState.NotFound })
  })

  it('returns an observation a test queued', async () => {
    const runtime = new MockBuildRuntime()
    const build = ref()
    runtime.observe(build.build.uuid, { state: BuildState.Failed, reason: 'boom' })

    expect(await runtime.readStatus(build)).toEqual({ state: BuildState.Failed, reason: 'boom' })
  })

  it('fails the next start once', async () => {
    const runtime = new MockBuildRuntime()
    runtime.failNextStart(new Error('cluster down'))

    await expect(runtime.start(ref(), spec)).rejects.toThrow('cluster down')
    await expect(runtime.start(ref(), spec)).resolves.toBeUndefined()
  })

  it('serves logs only for a build it started', async () => {
    const runtime = new MockBuildRuntime()
    const started = ref()
    await runtime.start(started, spec)

    expect(await runtime.readLogs(started, { tailLines: 10 })).toBe(
      `mock build log for ${started.build.uuid}`,
    )
    expect(await runtime.readLogs(ref(), { tailLines: 10 })).toBeNull()
  })
})
