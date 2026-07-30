import { defineConfig } from 'drizzle-kit'

const url = new URL(process.env.DATABASE_URL as string)
url.pathname = `/${process.env.DB_NAME}`

export default defineConfig({
  out: './src/sql/drizzle',
  dialect: 'postgresql',
  schema: './src/sql/schema.ts',
  dbCredentials: {
    // Only used by studio/push — generate and the runtime migrator don't connect.
    url: url.toString(),
  },
})
