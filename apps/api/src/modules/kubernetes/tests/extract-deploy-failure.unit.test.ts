import { before, describe, it } from 'node:test'
import type { V1Pod } from '@kubernetes/client-node'
import { expect } from 'expect'
import { extractDeployFailure } from '#src/modules/kubernetes/extract-deploy-failure.js'
import { TestBench } from '#src/test/setup/test-bench.js'

function pod(containerStatuses: unknown[], initContainerStatuses: unknown[] = []): V1Pod {
  return { status: { containerStatuses, initContainerStatuses } } as V1Pod
}

describe('extractDeployFailure', () => {
  before(() => TestBench.setupUnitTest())

  it('reports an image-pull failure with its reason and message', () => {
    const pods = [
      pod([
        {
          name: 'web',
          state: {
            waiting: {
              reason: 'ImagePullBackOff',
              message: 'Back-off pulling image "nginx:doesnotexist"',
            },
          },
        },
      ]),
    ]

    expect(extractDeployFailure(pods)).toEqual({
      reason: 'ImagePullBackOff',
      message: 'Back-off pulling image "nginx:doesnotexist"',
    })
  })

  it('reports a crashed (terminated non-zero) container', () => {
    const pods = [
      pod([
        {
          name: 'web',
          state: { terminated: { exitCode: 1, reason: 'Error', message: 'boom' } },
        },
      ]),
    ]

    expect(extractDeployFailure(pods)).toEqual({ reason: 'Error', message: 'boom' })
  })

  it('reports a failing init container', () => {
    const pods = [
      pod(
        [{ name: 'web', state: { waiting: { reason: 'PodInitializing' } } }],
        [
          {
            name: 'migrate',
            state: { waiting: { reason: 'CreateContainerConfigError', message: 'secret missing' } },
          },
        ],
      ),
    ]

    expect(extractDeployFailure(pods)).toEqual({
      reason: 'CreateContainerConfigError',
      message: 'secret missing',
    })
  })

  it('ignores benign waiting states (ContainerCreating / PodInitializing)', () => {
    const pods = [pod([{ name: 'web', state: { waiting: { reason: 'ContainerCreating' } } }])]

    expect(extractDeployFailure(pods)).toBeNull()
  })

  it('returns null when all containers are running (no failure)', () => {
    const pods = [pod([{ name: 'web', state: { running: { startedAt: new Date() } } }])]

    expect(extractDeployFailure(pods)).toBeNull()
  })

  it('falls back to a synthetic message when a failing state carries none', () => {
    const pods = [pod([{ name: 'web', state: { waiting: { reason: 'ImagePullBackOff' } } }])]

    expect(extractDeployFailure(pods)).toEqual({
      reason: 'ImagePullBackOff',
      message: 'ImagePullBackOff',
    })
  })
})
