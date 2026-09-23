import type { V1Pod, V1StatefulSet } from '@kubernetes/client-node'
import { DatabaseStatus } from '#src/modules/runtime/runtime.types.js'

const TERMINAL_WAITING_REASONS = new Set([
  'CrashLoopBackOff',
  'ImagePullBackOff',
  'ErrImagePull',
  'CreateContainerConfigError',
  'InvalidImageName',
])

export function mapDatabaseStatus(
  statefulSet: V1StatefulSet | null,
  pods: V1Pod[],
): DatabaseStatus {
  if (statefulSet === null) {
    return DatabaseStatus.NotFound
  }
  if ((statefulSet.status?.readyReplicas ?? 0) > 0) {
    return DatabaseStatus.Ready
  }

  const waiting = pods.flatMap(
    (pod) =>
      pod.status?.containerStatuses?.map((container) => container.state?.waiting?.reason) ?? [],
  )
  const failed = waiting.some((reason) => reason && TERMINAL_WAITING_REASONS.has(reason))
  return failed ? DatabaseStatus.Failed : DatabaseStatus.Provisioning
}
