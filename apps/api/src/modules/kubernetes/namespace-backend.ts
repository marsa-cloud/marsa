export class NamespaceConflictError extends Error {}

export abstract class NamespaceBackend {
  // Idempotent for the same environment uuid; NamespaceConflictError otherwise.
  abstract provision(namespace: string, environmentUuid: string): Promise<void>

  // A namespace that is already gone counts as deleted, so a retry completes.
  abstract destroy(namespace: string): Promise<void>
}
