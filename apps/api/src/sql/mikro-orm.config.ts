import { UnderscoreNamingStrategy } from '@mikro-orm/core'
import { defineConfig } from '@mikro-orm/postgresql'

// Loaded both by Nest's DatabaseModule (inside DI) and the standalone MikroORM CLI
// via `--config` (outside any Nest context) — so this can't use `ConfigService`
// injection like the rest of AgDR-0020's env-read consolidation. Reads `process.env`
// directly; presence is enforced by the global schema only on the Nest-booted path.
export default defineConfig({
  clientUrl: process.env.DATABASE_URL,
  dbName: process.env.DB_NAME,
  namingStrategy: UnderscoreNamingStrategy,
  migrations: {
    path: 'dist/src/sql/migrations',
  },
  entities: ['dist/src/**/*.entity.js'],
  // debug: ['query', 'query-params'],
})
