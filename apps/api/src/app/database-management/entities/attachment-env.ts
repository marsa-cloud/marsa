export const ALIAS_PATTERN = /^[a-z][a-z0-9-]*$/
export const ALIAS_MAX_LENGTH = 63

// `analytics-db` → `ANALYTICS_DB_`; null stays null, which is the unprefixed attachment.
export function envPrefixOf(alias: string | null): string | null {
  return alias === null ? null : `${alias.replaceAll('-', '_').toUpperCase()}_`
}
