import type { ConfigService } from '@nestjs/config'

export function databaseUrl(config: ConfigService): string {
  // DATABASE_URL carries no db path — it pairs a base url with a separate
  // DB_NAME. Set the db on the URL path, not Pool's `database` field, which
  // pg silently overwrites when parsing connectionString.
  const url = new URL(config.getOrThrow('DATABASE_URL'))
  url.pathname = `/${config.getOrThrow('DB_NAME')}`
  return url.toString()
}
