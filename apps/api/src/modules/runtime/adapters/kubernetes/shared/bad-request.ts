import { ApiException } from '@kubernetes/client-node'

export function isBadRequest(error: unknown): boolean {
  return error instanceof ApiException && error.code === 400
}
