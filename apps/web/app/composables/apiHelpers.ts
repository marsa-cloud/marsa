const GENERIC_ERROR = 'Something went wrong. Please try again.'

/**
 * Pull a user-facing message out of a failed `$fetch` call. NestJS surfaces
 * validation failures as `{ statusCode, message, error }` where `message` is a
 * string (single error) or a string[] (class-validator, one per field). `$fetch`
 * attaches that parsed body as `err.data`. Anything we can't read falls back to
 * a generic message so the user never sees a raw 400/500 dump.
 */
export function extractApiError(err: unknown, fallback: string = GENERIC_ERROR): string {
  const data = (err as { data?: unknown })?.data
  const message = (data as { message?: unknown })?.message

  if (Array.isArray(message)) {
    const parts = message.filter((m): m is string => typeof m === 'string')
    if (parts.length) return parts.join('; ')
  }

  if (typeof message === 'string' && message.trim()) return message

  return fallback
}

export interface EnvRow {
  key: string
  value: string
}

/**
 * Collapse the form's dynamic key/value rows into the `env` record the API
 * expects. Rows with a blank key are dropped (they're placeholder/empty rows);
 * keys are trimmed and a later duplicate wins.
 */
export function buildEnvRecord(rows: EnvRow[]): Record<string, string> {
  const env: Record<string, string> = {}
  for (const { key, value } of rows) {
    const trimmed = key.trim()
    if (trimmed) env[trimmed] = value
  }
  return env
}
