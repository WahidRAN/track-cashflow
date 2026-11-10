# Track Cashflow

Mobile-first PWA for tracking household spending via receipt capture. Built with Nuxt 4 + Supabase + Claude AI. Runs fully locally (Supabase CLI stack in Docker), or on Vercel with hosted Supabase.

## Architecture

- **Frontend**: Nuxt 4 (srcDir: `app/`), Vue 3, Tailwind CSS v4, Nuxt UI v4
- **Offline assets**: icons come from the installed `@iconify-json/heroicons` and `@iconify-json/lucide` sets (`icon.fallbackToApi: false`, `clientBundle.scan`), and web fonts are off (`ui.fonts: false`), so the app needs no internet except for the Claude API. Add any new icon collection to devDependencies and `icon.serverBundle.collections`
- **Backend**: Nuxt server routes (Nitro), all in `server/api/`
- **Database**: Supabase PostgreSQL via Drizzle ORM (`DATABASE_URL`). The schema source of truth is `supabase/migrations/*.sql`
- **AI**: Pluggable receipt extraction via `AI_PROVIDER`: Anthropic Claude (`claude-opus-4-5` default, via tool_choice) or local Ollama (`qwen2.5vl:7b` default). See `docs/local-ai-setup.md`
- **Price comparison**: exact match on the normalized `generalized_name` of the user's previous purchases (no embeddings / pgvector)
- **Auth**: Supabase magic link (`@nuxtjs/supabase`, PKCE). Locally, emails land in Mailpit
- **Storage**: private Supabase Storage bucket `receipts`, read/written only by the server

## Key Nuxt 4 Quirk

`srcDir` is `app/` so `~` resolves to `./app/` in client code. Server code and db/ are root-level, so use the path aliases in `nuxt.config.ts`:
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
app/                    # Nuxt srcDir: client code
  components/Receipt/   # CameraCapture, ImageUpload, TextInput, PriceIndicator, Edit*Modal
  components/Dashboard/ # CategoryBreakdown (donut chart), SearchFilter
  pages/                # index (dashboard), capture, history, receipt/[id], auth/login, auth/confirm
  composables/          # useReceipt (uploadAndProcess), useFormat (currency/locale formatting)
  layouts/default.vue   # Mobile bottom nav (Home / Capture / History)

server/
  api/
    receipts/
      index.post.ts     # Upload image or text → private bucket, create receipt (pending)
      index.get.ts      # Paginated list with search/category/date filters
      [id].get.ts / [id].patch.ts / [id].delete.ts   # detail, update metadata, delete (+ storage object)
      [id]/image.get.ts # Streams the image from the private bucket (session cookie auth)
      [id]/process.post.ts  # MAIN: AI extraction → price comparison → items
    items/[id].patch.ts # Update item; recomputes price comparison if generalizedName or unitPrice changed
    analytics/          # cashflow.get.ts (12-month totals), categories.get.ts (breakdown)
  utils/
    auth.ts             # requireUserId(event): user id from JWT claims `sub`, else 401
    db.ts               # useDb(), getPriceHistory(), comparePrice()
    pricing.ts          # normalizeGeneralizedName(), computePriceIndicator() (pure, no Nitro globals)
    receiptExtractor.ts # extractReceipt(): dispatches to Claude or Ollama per AI_PROVIDER
    receiptDto.ts       # row → API mapping, storage path / image URL helpers
    request.ts / datetime.ts  # input validation helpers / timezone handling (x-timezone header)
    claude.ts / supabase.ts   # useAnthropicClient() / useSupabaseAdmin()

supabase/
  config.toml           # Local stack (trimmed: db, api, auth, storage, Mailpit) + receipts bucket + auth URLs
  migrations/           # Schema, RLS, triggers, category seed. Applied by `npm run db:reset`

db/schema.ts            # Drizzle schema, hand-kept in sync with supabase/migrations
types/api.ts            # Shared TS interfaces used by both server and client
```

## AI Pipeline (`process.post.ts`)

1. Rate limit (50 processed receipts / 24 h per user), then atomically claim the receipt
2. Download the image from the private `receipts` bucket as base64 (client already resized it to max 1600px JPEG)
3. `extractReceipt()` picks the provider from `AI_PROVIDER`:
   - `claude` (default): `CLAUDE_MODEL` with `tool_choice: { type: 'any' }` and receipt schema as a tool → guaranteed structured JSON
   - `ollama`: `OLLAMA_MODEL` at `OLLAMA_BASE_URL` (local only, unreachable from Vercel)
4. Price comparison: `normalizeGeneralizedName()` → `getPriceHistory()` (same user, exact same `generalized_name`, positive unit prices) → `computePriceIndicator()` (cheaper / similar ±5% / expensive)
5. Update receipt metadata, replace items, set `processingStatus: 'done'`, all in one transaction

## Database Notes

- Schema changes: add a new timestamped file to `supabase/migrations/`, mirror it in `db/schema.ts`, run `npm run db:reset`. Don't use drizzle-kit generate/migrate (`drizzle.config.ts` exists only for `npm run db:studio`)
- Categories are seeded by the initial migration (no `seed.sql`)
- RLS is enabled on all tables, but the server connects via Drizzle as the table owner, so RLS does not apply there. **Every query must filter by the user id from `requireUserId(event)`**
- `serverSupabaseUser()` in @nuxtjs/supabase 2.x returns JWT claims (`sub`, no `.id`). Use `requireUserId()` instead
- Storage objects live at `<userId>/<receiptId>/original.<ext>`; `receipts.image_url` stores that path. The bucket is private: clients use `/api/receipts/:id/image`, never a storage URL
- Hosted DB via the transaction pooler: `useDb()` sets `prepare: false`

## Security

Secrets are server-only `runtimeConfig` keys in `nuxt.config.ts`: `anthropicApiKey`, `supabaseServiceKey`, `databaseUrl`. Public config is the Supabase URL + publishable/anon key (governed by RLS) and display settings (`currency`, `locale`). Secrets are read only inside server utils (`useAnthropicClient`, `useSupabaseAdmin`, `useDb`) and never returned or logged.

## Environment Variables

See `.env.example` (local values pre-filled, hosted block commented out).
- `NUXT_PUBLIC_SUPABASE_URL`, `NUXT_PUBLIC_SUPABASE_KEY`: read by @nuxtjs/supabase (`NUXT_PUBLIC_SUPABASE_ANON_KEY` is accepted as a fallback)
- `SUPABASE_SERVICE_ROLE_KEY` → `runtimeConfig.supabaseServiceKey` (admin client for storage)
- `DATABASE_URL`: local `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
- `AI_PROVIDER` (`claude` | `ollama`), `ANTHROPIC_API_KEY` (claude only), `CLAUDE_MODEL`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL`
- `NUXT_PUBLIC_CURRENCY` (ISO 4217, default `JPY`), `NUXT_PUBLIC_LOCALE` (default `en-US`)

## Development

```bash
npm install
npm run db:start     # Supabase CLI local stack (pinned via npx; needs Docker)
npm run db:status    # URLs + keys (`-- -o env` for .env format)
cp .env.example .env
npm run dev          # http://localhost:3000, magic-link mail at http://127.0.0.1:54324
npm run db:reset     # wipe local data + re-apply supabase/migrations
npm run db:stop
npx nuxi typecheck
```

Don't add the `supabase` npm package as a dependency (it breaks `npm ci`). The `db:*` scripts use `npx -y supabase@<pinned>`. Windows/WSL2 setup and phone testing: `README.md`.

## Deployment

Hosted on Vercel. Push to `main` triggers CI (`npm ci`, typecheck, build) then auto-deploy via the `@vercel/nuxt` preset. A hosted Supabase project handles DB, auth and storage: apply `supabase/migrations/`, create a private `receipts` bucket, and add the site's `/auth/confirm` URL to Auth redirect URLs.
