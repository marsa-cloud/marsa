import { UnderscoreNamingStrategy } from '@mikro-orm/core'
import { defineConfig } from '@mikro-orm/postgresql'

export default defineConfig({
  clientUrl: process.env.DATABASE_URL,
  dbName: process.env.DB_NAME,
  namingStrategy: UnderscoreNamingStrategy,
  migrations: {
    path: 'dist/src/sql/migrations',
    pathTs: 'src/sql/migrations',
  },
  entities: ['dist/src/**/*.entity.js'],
  // debug: ['query', 'query-params'],
})
