import { describe, it } from 'node:test'
import { expect } from 'expect'
import { MockEnvironmentRuntime } from '#src/modules/runtime/adapters/mock/mock-environment-runtime.js'
import type { EnvironmentRef } from '#src/modules/runtime/runtime.types.js'
import { generateUuid, type Uuid } from '#src/utils/uuid.js'

const ENVIRONMENT: EnvironmentRef = {
  project: { slug: 'demo' },
  environment: { uuid: generateUuid<Uuid<'Environment'>>(), slug: 'dev' },
}

describe('MockEnvironmentRuntime.provision', () => {
  it('fails exactly once when armed, so one test cannot leak into the next suite', async () => {
    const runtime = new MockEnvironmentRuntime()
    runtime.failNextProvision(new Error('cluster down'))

    await expect(runtime.provision(ENVIRONMENT)).rejects.toThrow('cluster down')
    await expect(runtime.provision(ENVIRONMENT)).resolves.toBeUndefined()
  })
})
