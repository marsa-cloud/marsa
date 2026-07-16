import type { V1Deployment } from '@kubernetes/client-node'
import { RolloutStatus } from '#src/modules/kubernetes/rollout-status.js'

/**
 * Derive the rollout outcome from a Deployment's `.status.conditions` alone
 * (#100, AgDR-0034 — conditions-only, at the default `progressDeadlineSeconds`;
 * no Pod inspection). Pure and total, so it is unit-tested from fixtures.
 *
 * Failure is only the authoritative `Progressing=False /
 * ProgressDeadlineExceeded` signal — so `ImagePullBackOff` / `CrashLoopBackOff`
 * surface as `Failed` only once the progress deadline elapses (the accepted
 * V0.1 lag; fast-fail is a deferred follow-up).
 *
 * `null` (Deployment not found) → `NotFound`, distinct from a real state.
 */
export function mapRolloutStatus(deployment: V1Deployment | null): RolloutStatus {
  if (deployment === null) {
    return RolloutStatus.NotFound
  }

  const conditions = deployment.status?.conditions ?? []
  const progressing = conditions.find((condition) => condition.type === 'Progressing')
  const available = conditions.find((condition) => condition.type === 'Available')

  if (progressing?.status === 'False' && progressing.reason === 'ProgressDeadlineExceeded') {
    return RolloutStatus.Failed
  }

  if (progressing?.reason === 'NewReplicaSetAvailable' && available?.status === 'True') {
    return RolloutStatus.Complete
  }

  return RolloutStatus.Progressing
}
