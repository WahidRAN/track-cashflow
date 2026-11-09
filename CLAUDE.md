# Track Cashflow

Mobile-first PWA for tracking household spending via receipt capture. Built with Nuxt 4 + Supabase + Claude AI.

## Architecture

- **Frontend**: Nuxt 4 (srcDir: `app/`), Vue 3, Tailwind CSS v4, Nuxt UI v4
- **Backend**: Nuxt server routes (Nitro), all in `server/api/`
- **Database**: Supabase (PostgreSQL + pgvector), Drizzle ORM
- **AI**: Pluggable receipt extraction via `AI_PROVIDER` — Anthropic Claude (`claude-opus-4-5` default, via tool_choice) or local Ollama (`qwen2.5vl:7b` default). See `docs/local-ai-setup.md`
- **Embeddings**: Voyage AI `voyage-3-lite` (1024-dim) for item price comparison RAG — optional; skipped if `VOYAGE_API_KEY` is empty
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
    receiptExtractor.ts # extractReceipt() — dispatches to Claude or Ollama per AI_PROVIDER
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
2. Fetch receipt image from Supabase Storage as base64 (client already resized it to max 1600px JPEG)
3. `extractReceipt()` in `server/utils/receiptExtractor.ts` picks the provider from `AI_PROVIDER`:
   - `claude` (default): `CLAUDE_MODEL` with `tool_choice: { type: 'any' }` and receipt schema as a tool → guaranteed structured JSON
   - `ollama`: `OLLAMA_MODEL` at `OLLAMA_BASE_URL` (local only — unreachable from Vercel; setup in `docs/local-ai-setup.md`)
4. Update receipt metadata (storeName, datetime, totals)
5. If `VOYAGE_API_KEY` is set: batch embed all item `generalizedName` values via `voyage-3-lite` (otherwise steps 5–6 are skipped and no price indicator is computed)
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

AI provider vars (server-only):
- `AI_PROVIDER` — `claude` (default) | `ollama`
- `CLAUDE_MODEL` — default `claude-opus-4-5`
- `OLLAMA_BASE_URL` — default `http://localhost:11434`
- `OLLAMA_MODEL` — default `qwen2.5vl:7b`
- `ANTHROPIC_API_KEY` — required only when `AI_PROVIDER=claude`
- `VOYAGE_API_KEY` — optional; empty disables embeddings/price comparison

Local Ollama setup (Windows + WSL2 networking, RTX 2060 expectations, quality comparison): `docs/local-ai-setup.md`.

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
