import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  out: './src/sql/drizzle',
  dialect: 'postgresql',
  schema: './src/sql/schema.ts',
  dbCredentials: {
    // Only used by studio/push — generate and the runtime migrator don't connect.
    url: `${process.env.DATABASE_URL}/${process.env.DB_NAME}`,
  },
})
