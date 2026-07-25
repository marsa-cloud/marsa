import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import { MIGRATIONS_FOLDER } from '#src/modules/database/drizzle.factory.js'

async function globalTestSetup(): Promise<void> {
  // DATABASE_URL carries no db path — set it on the URL path (see DatabaseModule).
  const url = new URL(process.env.DATABASE_URL as string)
  url.pathname = `/${process.env.DB_NAME}`
  const pool = new Pool({ connectionString: url.toString() })

  try {
    // Big-bang: drop the public schema AND drizzle's migration-tracking schema
    // (migrate() records applied migrations in a separate `drizzle` schema that a
    // public-only drop leaves behind — which would make migrate a no-op on reruns),
    // then rebuild everything from the Drizzle baseline.
    await pool.query(
      'DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;',
    )
    await migrate(drizzle({ client: pool }), { migrationsFolder: MIGRATIONS_FOLDER })
    console.log('Global setup completed')
  } finally {
    await pool.end()
  }
}

void globalTestSetup()
