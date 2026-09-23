/** DNS-1123 label: the slug is the in-cluster hostname and the K8s object name. */
export const DATABASE_SLUG_PATTERN = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/
export const DATABASE_SLUG_MAX_LENGTH = 63

/** local-path ignores the request and cannot resize, so the bounds are advisory (#209). */
export const MIN_STORAGE_GIB = 1
export const MAX_STORAGE_GIB = 1024
export const DEFAULT_STORAGE_GIB = 10
