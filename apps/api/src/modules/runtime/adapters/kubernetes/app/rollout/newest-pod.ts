import type { V1Pod } from '@kubernetes/client-node'

/**
 * The pod with the latest `creationTimestamp` — the one from the current
 * rollout (#114). Pure and total; `null` for an empty list. A pod missing a
 * timestamp sorts oldest so a timestamped peer always wins. `creationTimestamp`
 * is only second-granular, so replicas rolled out together routinely tie; ties
 * break on the greater pod name so the pick is deterministic across reads
 * (`listNamespacedPod` order is not guaranteed stable).
 */
export function newestPod(pods: V1Pod[]): V1Pod | null {
  let newest: V1Pod | null = null
  let newestAt = -Infinity
  for (const pod of pods) {
    const at = pod.metadata?.creationTimestamp
      ? new Date(pod.metadata.creationTimestamp).getTime()
      : -Infinity
    const wins =
      newest === null ||
      at > newestAt ||
      (at === newestAt && (pod.metadata?.name ?? '') > (newest.metadata?.name ?? ''))
    if (wins) {
      newest = pod
      newestAt = at
    }
  }
  return newest
}
