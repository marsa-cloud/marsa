import { nodePinSpecOf } from '#src/app/app-management/entities/node-pin.js'
import type { AppPlacement } from '#src/app/app-management/queries/app-placement.js'
import { catalogueEntry } from '#src/app/database-management/catalogue/engine-catalogue.js'
import { envPrefixOf } from '#src/app/database-management/entities/attachment-env.js'
import type { AttachedDatabase } from '#src/app/database-management/queries/app-attachments.js'
import type { Release } from '#src/app/release/entities/release.table.js'
import {
  type AppDeploySpec,
  type AttachedDatabaseSpec,
  type RegistryCredentials,
} from '#src/modules/runtime/runtime.types.js'

export interface DeploySpecOptions {
  baseDomain: string
  attachments: AttachedDatabase[]
  credentials?: RegistryCredentials
}

// The pin is placement, not config: it comes from the app today, never from the release.
// Attachments are placement for the same reason (#207).
export function deploySpecOf(
  placement: AppPlacement,
  release: Release,
  { baseDomain, attachments, credentials }: DeploySpecOptions,
): AppDeploySpec {
  const { app } = placement
  const resolved = resolveAttachments(attachments)
  return {
    releaseUuid: release.uuid,
    image: release.imageRef,
    port: release.containerPort,
    env: withoutInjectedNames(release.env, resolved),
    attachments: resolved,
    minReplicas: release.minReplicas,
    maxReplicas: release.maxReplicas,
    host: `${app.slug}.${baseDomain}`,
    nodePin: nodePinSpecOf(app.nodePin),
    ...(credentials ? { credentials } : {}),
  }
}

// An attachment whose engine-major is no longer in the catalogue cannot name its keys, so it
// injects nothing rather than guessing.
function resolveAttachments(attachments: AttachedDatabase[]): AttachedDatabaseSpec[] {
  return attachments.flatMap((attachment) => {
    const entry = catalogueEntry(attachment.engine, attachment.version)
    if (!entry) {
      return []
    }
    return [
      {
        databaseSlug: attachment.databaseSlug,
        envPrefix: envPrefixOf(attachment.alias),
        keys: entry.publishedKeys,
      },
    ]
  })
}

// The attachment wins a name collision, and it wins here rather than in the manifest — two env
// entries with one name resolve silently in Kubernetes.
function withoutInjectedNames(
  env: Record<string, string>,
  attachments: AttachedDatabaseSpec[],
): Record<string, string> {
  const injected = new Set(
    attachments.flatMap((attachment) =>
      attachment.keys.map((key) => `${attachment.envPrefix ?? ''}${key}`),
    ),
  )
  return Object.fromEntries(Object.entries(env).filter(([key]) => !injected.has(key)))
}
