/**
 * DNS-1123 label: the slug becomes the public subdomain (`<slug>.<base>`) and
 * the K8s object names, so it must be a valid label (lowercase alphanumeric +
 * hyphens, ≤ 63 chars). Validated at the DTO boundary (Rex flagged this on #97).
 */
export const SLUG_PATTERN = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/
export const SLUG_MAX_LENGTH = 63

/** Inclusive TCP port range a container may listen on. */
export const MIN_CONTAINER_PORT = 1
export const MAX_CONTAINER_PORT = 65535

/**
 * Replica bounds for a deploy. A floor of 0 is scale-to-zero: KEDA sleeps the
 * app while idle and cold-starts it on the first HTTP request (AgDR-0043). The
 * ceiling guards against an operator exhausting cluster capacity; tune as the
 * platform's capacity model firms up.
 */
export const MIN_REPLICAS = 0
export const MAX_REPLICAS = 100

/**
 * Idle time before KEDA scales an app back down to its floor. Platform-wide
 * rather than per-app: per-app scaling config is the correct model but is
 * deferred for scope (AgDR-0043).
 */
export const SCALEDOWN_PERIOD_SECONDS = 300
