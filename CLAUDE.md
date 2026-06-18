# Track Cashflow

Mobile-first PWA for tracking household spending via receipt capture. Built with Nuxt 4 + Supabase + Claude AI.

## Architecture

- **Frontend**: Nuxt 4 (srcDir: `app/`), Vue 3, Tailwind CSS v4, Nuxt UI v4
- **Backend**: Nuxt server routes (Nitro), all in `server/api/`
- **Database**: Supabase (PostgreSQL + pgvector), Drizzle ORM
- **AI**: Anthropic Claude `claude-opus-4-5` for receipt OCR/extraction via tool_choice
- **Embeddings**: Voyage AI `voyage-3-lite` (1024-dim) for item price comparison RAG
- **Auth**: Supabase magic link (`@nuxtjs/supabase`)

## Key Nuxt 4 Quirk

`srcDir` is `app/` so `~` resolves to `./app/` in client code. Server code and db/ are root-level — use the path aliases in `nuxt.config.ts`:
```typescript
alias: {
  '~/db': './db',
  '~/types': './types',
  '~/server': './server',
}
```
These aliases make `~/db/schema`, `~/types/api`, and `~/server/utils/*` work from server routes.

## Directory Structure

```
app/                    # Nuxt srcDir — client code
  components/
    Receipt/            # CameraCapture, ImageUpload, TextInput, PriceIndicator,
                        #   EditReceiptModal, EditItemModal
    Dashboard/          # CategoryBreakdown (donut chart), SearchFilter
  pages/
    index.vue           # Dashboard: month summary + category chart + recent list
    capture.vue         # Tabbed input: camera / upload / text
    history.vue         # Date-grouped receipt history with search/filter
    receipt/[id].vue    # Receipt detail with inline editing
    auth/login.vue      # Magic link login
  composables/
    useReceipt.ts       # uploadAndProcess() helper
  layouts/
    default.vue         # Mobile bottom nav (Home / Capture / History)

server/
  api/
    receipts/
      index.post.ts     # Upload image or text, create receipt (pending)
      index.get.ts      # Paginated list with search/category/date filters
      [id].get.ts       # Receipt + items detail
      [id].patch.ts     # Update receipt metadata
      [id].delete.ts    # Delete receipt + storage
      [id]/
        process.post.ts # MAIN: Claude Vision → Voyage embeddings → pgvector → items
    items/
      [id].patch.ts     # Update item; re-embeds if generalizedName changed
    analytics/
      cashflow.get.ts   # 12-month monthly totals
      categories.get.ts # Category breakdown for date range
  utils/
    claude.ts           # useAnthropicClient()
    voyage.ts           # useVoyageClient()
    supabase.ts         # useSupabaseAdmin()
    db.ts               # useDb() + findSimilarItems() pgvector helper

db/
  schema.ts             # Drizzle schema (note: vector(1024) column via raw SQL)
  migrations/
    0000_initial.sql    # Full schema: pgvector, HNSW index, RLS, triggers, categories

types/
  api.ts                # Shared TS interfaces used by both server and client
```

## AI Pipeline (`process.post.ts`)

1. Rate limit check (50/day per user)
2. Fetch receipt image from Supabase Storage as base64
3. Call `claude-opus-4-5` with `tool_choice: { type: 'any' }` and receipt schema as a tool → guaranteed structured JSON
4. Update receipt metadata (storeName, datetime, totals)
5. Batch embed all item `generalizedName` values via `voyage-3-lite`
6. For each item: pgvector HNSW cosine similarity search (threshold 0.82) → compute price indicator
7. Insert items with raw SQL (vector column needs `::vector` cast)
8. Set `processingStatus: 'done'`

## Database Notes

- `receipt_items.embedding` is `vector(1024)` — NOT in Drizzle schema (added via raw SQL migration)
- Use `db.execute(sql\`...\`)` for any vector operations
- `findSimilarItems()` in `server/utils/db.ts` encapsulates the pgvector similarity query
- RLS is enabled on all tables — server routes use the admin client (`useSupabaseAdmin()`) which bypasses RLS
- `serverSupabaseUser(event)` from `'#supabase/server'` gets the authenticated user

## Security

All secrets are confirmed server-only. In `nuxt.config.ts`, `anthropicApiKey`, `voyageApiKey`, `supabaseServiceKey`, and `databaseUrl` are top-level `runtimeConfig` keys (never serialized to the client bundle). Only `supabaseUrl` and `supabaseAnonKey` appear under `runtimeConfig.public` — these are safe to expose (the anon key is intentionally public and governed by Supabase RLS). Server route handlers access secrets via `useRuntimeConfig()` inside server utility helpers (`useAnthropicClient`, `useVoyageClient`, `useSupabaseAdmin`, `useDb`) and never return or log them. No secrets leak to the client.

## Environment Variables

See `.env.example`. All secrets are `runtimeConfig` server-only keys (not `public`). The client only receives `NUXT_PUBLIC_SUPABASE_URL` and `NUXT_PUBLIC_SUPABASE_ANON_KEY`.

## Development

```bash
# Install
npm install

# Run dev server (needs .env with Supabase + AI keys)
npm run dev

# Type check
npx nuxi typecheck

# Apply DB migrations (run against your Supabase project)
# Connect to Supabase SQL editor and run db/migrations/0000_initial.sql
```

## Deployment

Hosted on Vercel. Push to `main` triggers CI (typecheck) then auto-deploy via `@vercel/nuxt` preset.
Supabase project handles DB, auth, and storage.
