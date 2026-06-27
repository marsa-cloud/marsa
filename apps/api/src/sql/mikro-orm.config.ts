import { UnderscoreNamingStrategy } from '@mikro-orm/core'
import { defineConfig } from '@mikro-orm/postgresql'

export default defineConfig({
  clientUrl: process.env.DATABASE_URL,
  dbName: process.env.DB_NAME,
  namingStrategy: UnderscoreNamingStrategy,
  migrations: {
    path: 'dist/src/sql/migrations',
    pathTs: 'src/sql/migrations',
    // Run each migration in its own transaction instead of wrapping the whole
    // pending batch in one. Required for non-transactional migrations (e.g.
    // `ALTER TYPE ... ADD VALUE`, see Migration20260627120000 / AgDR-0024): under
    // the default all-or-nothing master transaction, such a migration runs on a
    // separate connection and can't see types/tables created by earlier,
    // not-yet-committed migrations in the same batch.
    allOrNothing: false,
  },
  entities: ['dist/src/**/*.entity.js'],
  // debug: ['query', 'query-params'],
})
