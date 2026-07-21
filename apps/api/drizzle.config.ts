import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  out: './src/sql/migrations',
  dialect: 'postgresql',
  schema: './src/sql/schema',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
    database: process.env.DB_NAME!,
  },
})
