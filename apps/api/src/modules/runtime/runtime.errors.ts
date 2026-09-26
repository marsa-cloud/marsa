export class EnvironmentConflictError extends Error {}

// The runtime stamps the live release itself, so a malformed marker is a Marsa bug.
export class InvalidReleaseAnnotationError extends Error {}

export class RegistryRequestError extends Error {}
