/**
 * Neutral rollout outcome read from a Kubernetes Deployment (#100, AgDR-0034).
 * Deliberately distinct from the domain `DeployStatus` — this is the raw
 * cluster-side signal the kubernetes module returns, which the feature maps to
 * its own status. Keeping it here means k8s concerns never leak the domain enum
 * into a support module (features depend on this module, not the reverse).
 *
 * `NotFound` is *absence of observation* (the Deployment does not exist yet, or
 * was deleted) — not a terminal state. Callers must never persist a terminal
 * outcome from it.
 */
export enum RolloutStatus {
  Complete = 'complete',
  Failed = 'failed',
  Progressing = 'progressing',
  NotFound = 'not_found',
}
