import { RegistryRequestError } from '#src/modules/runtime/runtime.errors.js'

export function assertRegistryOk(response: Response, action: string): void {
  if (!response.ok) {
    throw new RegistryRequestError(`Registry could not ${action}: HTTP ${response.status}`)
  }
}
