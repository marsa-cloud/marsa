import type { CoreV1Event } from '@kubernetes/client-node'

import type { DeployEvent } from '#src/modules/kubernetes/deploy-backend.types.js'

/**
 * Pick the most recent timestamp a K8s Event exposes (#115). Legacy events carry
 * `lastTimestamp`; the newer Events API coalesces repeats into `series` and uses
 * `eventTime`. Fall back to the object's creation time, then the epoch, so the
 * function is total (never throws, always yields a sortable ISO string).
 */
function lastSeenOf(event: CoreV1Event): string {
  const stamp =
    event.lastTimestamp ??
    event.series?.lastObservedTime ??
    event.eventTime ??
    event.metadata?.creationTimestamp
  return (stamp ? new Date(stamp) : new Date(0)).toISOString()
}

/**
 * Map raw K8s Events to neutral {@link DeployEvent}s (#115). Pure and total, so
 * it is unit-tested from fixtures — the cluster-I/O that fetches the events lives
 * in {@link DirectApplyDeployBackend}.
 */
export function mapDeployEvents(events: CoreV1Event[]): DeployEvent[] {
  return events.map((event) => ({
    type: event.type ?? 'Normal',
    reason: event.reason ?? '',
    message: event.message ?? '',
    count: event.count ?? event.series?.count ?? 1,
    lastSeen: lastSeenOf(event),
    involvedObject: {
      kind: event.involvedObject?.kind ?? '',
      name: event.involvedObject?.name ?? '',
    },
  }))
}
