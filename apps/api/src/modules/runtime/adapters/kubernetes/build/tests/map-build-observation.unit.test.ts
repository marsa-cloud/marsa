import { describe, it } from 'node:test'
import type { V1Job, V1Pod } from '@kubernetes/client-node'
import { expect } from 'expect'
import { mapBuildObservation } from '#src/modules/runtime/adapters/kubernetes/build/observe/map-build-observation.js'
import { BuildState } from '#src/modules/runtime/runtime.types.js'

const job = (type: string, reason?: string, message?: string): V1Job => ({
  status: { conditions: [{ type, status: 'True', reason, message }] },
})

const podWith = (message: string): V1Pod => ({
  status: {
    containerStatuses: [
      {
        name: 'buildkit',
        image: 'x',
        imageID: 'x',
        ready: false,
        restartCount: 0,
        state: { terminated: { exitCode: 1, message } },
      },
    ],
  },
})

describe('mapBuildObservation', () => {
  it('reads a job without a terminal condition as running', () => {
    expect(mapBuildObservation({ status: { active: 1 } }, [])).toEqual({
      state: BuildState.Running,
    })
  })

  it('reads Complete as succeeded', () => {
    expect(mapBuildObservation(job('Complete'), [])).toEqual({ state: BuildState.Succeeded })
  })

  it('reports a timeout plainly', () => {
    expect(mapBuildObservation(job('Failed', 'DeadlineExceeded'), [])).toEqual({
      state: BuildState.Failed,
      reason: 'The build timed out after 30 minutes.',
    })
  })

  it('surfaces the build error from the pod termination message', () => {
    const failed = mapBuildObservation(job('Failed', 'BackoffLimitExceeded', 'backoff limit'), [
      podWith(
        '#1 ERROR: x\nerror: failed to solve: failed to read dockerfile: open Dockerfile: no such file',
      ),
    ])

    expect(failed).toEqual({
      state: BuildState.Failed,
      reason: 'error: failed to solve: failed to read dockerfile: open Dockerfile: no such file',
    })
  })

  it('falls back to the job condition message when the pod is gone', () => {
    expect(mapBuildObservation(job('Failed', 'BackoffLimitExceeded', 'backoff limit'), [])).toEqual(
      { state: BuildState.Failed, reason: 'backoff limit' },
    )
  })
})
