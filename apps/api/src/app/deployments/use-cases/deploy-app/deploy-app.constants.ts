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

/** Minimum replica count for a deploy. */
export const MIN_REPLICAS = 1
