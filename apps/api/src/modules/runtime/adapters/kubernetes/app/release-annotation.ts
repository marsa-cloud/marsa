import { InvalidReleaseAnnotationError } from '#src/modules/runtime/runtime.errors.js'
import type { Uuid } from '#src/utils/uuid.js'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Marsa writes this annotation itself, so a present-but-malformed value is a Marsa bug.
export function parseReleaseAnnotation(
  value: string | undefined,
  deploymentName: string,
): Uuid<'Release'> | null {
  if (value === undefined) {
    return null
  }
  if (!UUID_PATTERN.test(value)) {
    throw new InvalidReleaseAnnotationError(
      `Deployment '${deploymentName}' carries release annotation '${value}', which is not a uuid.`,
    )
  }
  return value as Uuid<'Release'>
}
