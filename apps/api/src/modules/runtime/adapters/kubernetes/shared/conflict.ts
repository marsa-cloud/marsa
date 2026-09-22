import { ApiException } from '@kubernetes/client-node'

export function isConflict(error: unknown): boolean {
  return error instanceof ApiException && error.code === 409
}

export async function ignoreConflict(create: () => Promise<unknown>): Promise<void> {
  try {
    await create()
  } catch (error) {
    if (isConflict(error)) {
      return
    }
    throw error
  }
}
