import { NestFactory } from '@nestjs/core'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import { AppModule } from '#src/app.module.js'
import { DATABASE, DATABASE_POOL } from '#src/modules/database/database.tokens.js'
import { type Database, MIGRATIONS_FOLDER } from '#src/modules/database/drizzle.factory.js'

async function globalTestSetup(): Promise<void> {
  const context = await NestFactory.createApplicationContext(AppModule.forRoot([]), {
    logger: ['error', 'warn'],
  })

  try {
    // Big-bang: drop the public schema AND drizzle's migration-tracking schema
    // (migrate() records applied migrations in a separate `drizzle` schema that a
    // public-only drop leaves behind — which would make migrate a no-op on reruns),
    // then rebuild everything from the Drizzle baseline.
    await context
      .get<Pool>(DATABASE_POOL)
      .query(
        'DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;',
      )
    await migrate(context.get<Database>(DATABASE), { migrationsFolder: MIGRATIONS_FOLDER })
    console.log('Global setup completed')
  } finally {
    await context.close()
  }
}

globalTestSetup().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
