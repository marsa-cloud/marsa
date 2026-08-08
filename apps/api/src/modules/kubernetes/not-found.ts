import { ApiException } from '@kubernetes/client-node'

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiException && error.code === 404
}

/**
 * Teardown must stay idempotent: a partial failure is retried, and the
 * resources the first attempt already removed must not fail the second.
 */
export async function ignoreNotFound(remove: () => Promise<unknown>): Promise<void> {
  try {
    await remove()
  } catch (error) {
    if (isNotFound(error)) {
      return
    }
    throw error
  }
}
