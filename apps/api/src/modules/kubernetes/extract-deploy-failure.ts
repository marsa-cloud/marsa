import type { V1ContainerStatus, V1Pod } from '@kubernetes/client-node'
import type { DeployFailure } from '#src/modules/kubernetes/deploy-backend.types.js'

/**
 * Container `waiting.reason` values that mean the deploy is failing, not merely
 * starting up. Benign waiting reasons (`ContainerCreating`, `PodInitializing`)
 * are deliberately absent so a still-starting pod isn't reported as a failure.
 */
const FAILING_WAITING_REASONS: ReadonlySet<string> = new Set([
  'ImagePullBackOff',
  'ErrImagePull',
  'InvalidImageName',
  'ImageInspectError',
  'ErrImageNeverPull',
  'RegistryUnavailable',
  'CreateContainerConfigError',
  'CreateContainerError',
  'RunContainerError',
  'CrashLoopBackOff',
  'CNINetworkError',
])

function containerFailure(status: V1ContainerStatus): DeployFailure | null {
  const waiting = status.state?.waiting
  if (waiting?.reason && FAILING_WAITING_REASONS.has(waiting.reason)) {
    return { reason: waiting.reason, message: waiting.message ?? waiting.reason }
  }

  const terminated = status.state?.terminated
  if (terminated && terminated.exitCode !== 0) {
    const reason = terminated.reason ?? 'Error'
    return {
      reason,
      message: terminated.message ?? `Container exited with code ${terminated.exitCode}`,
    }
  }

  return null
}

/**
 * The first failing container state across an app's pods (#115) — init
 * containers first, since an init failure blocks the app from ever starting.
 * Pure and total; the cluster-I/O that lists the pods lives in
 * {@link DirectApplyDeployBackend}. Returns `null` when nothing is failing.
 */
export function extractDeployFailure(pods: V1Pod[]): DeployFailure | null {
  for (const pod of pods) {
    const statuses = [
      ...(pod.status?.initContainerStatuses ?? []),
      ...(pod.status?.containerStatuses ?? []),
    ]
    for (const status of statuses) {
      const failure = containerFailure(status)
      if (failure) {
        return failure
      }
    }
  }
  return null
}
