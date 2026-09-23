import { randomBytes } from 'node:crypto'
import type { DatabaseCredentials } from '#src/modules/runtime/runtime.types.js'

const PASSWORD_BYTES = 32

/** Superuser: CREATE EXTENSION and ORM-created shadow/test databases both need it. */
const SUPERUSER = 'postgres'

export function databaseNameOf(slug: string): string {
  return slug.replaceAll('-', '_')
}

export function generateCredentials(slug: string): DatabaseCredentials {
  return {
    user: SUPERUSER,
    // Hex, so the password stays URL-safe inside the composed DATABASE_URL.
    password: randomBytes(PASSWORD_BYTES).toString('hex'),
    database: databaseNameOf(slug),
  }
}
