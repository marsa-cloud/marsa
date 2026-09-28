export const REGISTRY_PUSH_USER = 'marsa-push'
export const REGISTRY_PULL_USER = 'marsa-pull'

// Deletes run under the app row lock, so a stalled registry must not hold it indefinitely.
export const REGISTRY_REQUEST_TIMEOUT_MS = 10_000

export const MANIFEST_ACCEPT = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.docker.distribution.manifest.v2+json',
].join(', ')
