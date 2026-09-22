// RESTRICT raises restrict_violation, NO ACTION raises foreign_key_violation; both mean "still referenced".
const REFERENCED_ROW_CODES = new Set(['23001', '23503'])

// Drizzle wraps the driver error, so the pg code can sit anywhere down the cause chain.
export function isForeignKeyViolation(error: unknown): boolean {
  for (let current: unknown = error; current instanceof Error; current = current.cause) {
    if (REFERENCED_ROW_CODES.has((current as Error & { code?: string }).code ?? '')) {
      return true
    }
  }
  return false
}
