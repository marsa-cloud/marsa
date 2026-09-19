export class NamespaceConflictError extends Error {}

export abstract class NamespaceBackend {
  // Idempotent for the same environment uuid; NamespaceConflictError otherwise.
  abstract provision(namespace: string, environmentUuid: string): Promise<void>

  // Only deletes a namespace labelled for this environment; a missing or foreign one is left alone.
  abstract destroy(namespace: string, environmentUuid: string): Promise<void>
}
