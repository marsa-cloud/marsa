import type { V1Job, V1Pod } from '@kubernetes/client-node'
import { BUILD_DEADLINE_SECONDS } from '#src/modules/runtime/build-runtime.js'
import { type BuildObservation, BuildState } from '#src/modules/runtime/runtime.types.js'

const MAX_REASON_LENGTH = 2000

function condition(job: V1Job, type: string) {
  return job.status?.conditions?.find((c) => c.type === type && c.status === 'True')
}

// BuildKit ends a failed build with an `error:` line; earlier lines are progress noise.
function lastErrorLine(message: string): string {
  const lines = message.trim().split('\n')
  const error = [...lines].reverse().find((line) => line.startsWith('error:'))
  return (error ?? lines.at(-1) ?? message).slice(0, MAX_REASON_LENGTH)
}

export function mapBuildObservation(job: V1Job, pods: V1Pod[]): BuildObservation {
  if (condition(job, 'Complete')) {
    return { state: BuildState.Succeeded }
  }
  const failed = condition(job, 'Failed')
  if (!failed) {
    return { state: BuildState.Running }
  }
  if (failed.reason === 'DeadlineExceeded') {
    return {
      state: BuildState.Failed,
      reason: `The build timed out after ${BUILD_DEADLINE_SECONDS / 60} minutes.`,
    }
  }
  const message = pods
    .flatMap((pod) => pod.status?.containerStatuses ?? [])
    .map((status) => status.state?.terminated?.message)
    .find((text): text is string => Boolean(text))
  return {
    state: BuildState.Failed,
    reason: message ? lastErrorLine(message) : (failed.message ?? 'The build failed.'),
  }
}
