import type { Config } from 'drizzle-kit'

// Used only by `npm run db:studio` (Drizzle Studio as a DB browser).
// The schema source of truth is supabase/migrations/*.sql, applied by the Supabase CLI —
// don't use drizzle-kit generate/migrate/push.
try {
  process.loadEnvFile() // Node >= 20.12: read .env if present
}
catch {}

export default {
  schema: './db/schema.ts',
  dialect: 'postgresql',
  schemaFilter: ['public'],
  dbCredentials: {
    // Defaults to the local `supabase start` database
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  },
} satisfies Config
