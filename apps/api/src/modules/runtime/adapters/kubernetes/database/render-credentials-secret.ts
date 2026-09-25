import type { V1Secret } from '@kubernetes/client-node'
import { CREDENTIALS_SECRET_SUFFIX } from '#src/modules/runtime/adapters/kubernetes/database/database.constants.js'

export function credentialsSecretName(slug: string): string {
  return `${slug}${CREDENTIALS_SECRET_SUFFIX}`
}

export function renderCredentialsSecret(
  slug: string,
  publishedVariables: Record<string, string>,
): V1Secret {
  return {
    apiVersion: 'v1',
    kind: 'Secret',
    type: 'Opaque',
    metadata: { name: credentialsSecretName(slug), labels: { app: slug } },
    stringData: publishedVariables,
  }
}
