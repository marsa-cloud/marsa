/** DNS-1035 label: the slug is the public subdomain and names the app's Service. */
export const SLUG_PATTERN = /^[a-z]([-a-z0-9]*[a-z0-9])?$/
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
