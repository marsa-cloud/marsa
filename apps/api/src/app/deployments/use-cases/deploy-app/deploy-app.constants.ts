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
 * Replica bounds for a deploy. The max is a sane guard against an operator
 * requesting an unbounded replica count that could exhaust cluster capacity;
 * tune as the platform's capacity model firms up.
 */
export const MIN_REPLICAS = 1
export const MAX_REPLICAS = 100

/**
 * Valid Kubernetes env-var name (`EnvVar.name`): must start with a letter or
 * one of `-._`, followed by letters, digits, or `-._`. Keys that don't match
 * fail late at cluster apply, so we reject them at the DTO boundary instead.
 */
export const ENV_KEY_PATTERN = /^[-._a-zA-Z][-._a-zA-Z0-9]*$/
