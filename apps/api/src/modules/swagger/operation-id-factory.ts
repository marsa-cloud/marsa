import type { OperationIdFactory } from '@nestjs/swagger'

/**
 * Derive an OpenAPI `operationId` from a controller class name and its URI version.
 *
 * Rule: strip the trailing `Controller`, lower-case the first character, and append the
 * capitalised version segment. With URI versioning the SwaggerModule passes the version
 * as its prefixed form (`v1`), so `capitalise('v1')` yields the `V1` suffix that the
 * codebase relies on (see `apps/api/.claude/CLAUDE.md` — operationId section).
 *
 *   GetApiInfoController  + 'v1' -> getApiInfoV1
 *   DeployAppController   + 'v1' -> deployAppV1
 *   GetManifestController + 'v1' -> getManifestV1
 *
 * Every controller is a single-endpoint (CQRS-style) unit whose method is always `handle`,
 * so the method key is intentionally ignored — the class name alone identifies the operation.
 */
export function deriveOperationId(controllerKey: string, version?: string): string {
  const base = controllerKey.replace(/Controller$/, '')
  if (base.length === 0) {
    return controllerKey
  }

  const camel = base.charAt(0).toLowerCase() + base.slice(1)
  const suffix = version ? version.charAt(0).toUpperCase() + version.slice(1) : ''

  return `${camel}${suffix}`
}

/**
 * Global `operationIdFactory` for `SwaggerModule.createDocument`. Applied once so every
 * endpoint gets a consistent, version-suffixed `operationId` without hand-writing one.
 */
export const operationIdFactory: OperationIdFactory = (controllerKey, _methodKey, version) =>
  deriveOperationId(controllerKey, version)
