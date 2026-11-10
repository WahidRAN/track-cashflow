# Track Cashflow

Mobile-first PWA for tracking household spending by photographing receipts. Nuxt 4 + Supabase (Postgres, Auth, Storage) + AI receipt extraction (Claude API or a local Ollama vision model).

The whole app (frontend, API, database, auth, storage) runs on your laptop. Supabase runs locally through the [Supabase CLI](https://supabase.com/docs/guides/local-development) in Docker.

## Run locally on Windows (WSL2)

### Prerequisites

- **Windows 11** with **WSL2** and an **Ubuntu** distro (`wsl --install -d Ubuntu` in PowerShell).
- **Docker Desktop** using the WSL2 backend. Turn on *Settings → Resources → WSL integration* for your Ubuntu distro, and keep Docker Desktop running while you work.
- **Node 22** inside WSL, e.g. via [nvm](https://github.com/nvm-sh/nvm): `nvm install 22`.
- **git** inside WSL.
- On 16 GB of RAM, cap the WSL VM in `%UserProfile%\.wslconfig` (`memory=6GB`). Docker Desktop runs inside the same VM. See [docs/local-ai-setup.md](docs/local-ai-setup.md#6-ram-budget-16-gb).

### First run

In the Ubuntu (WSL) terminal, clone into the Linux filesystem (e.g. `~/`), **not** `/mnt/c/...`. File watching and hot reload are much faster there.

```bash
cd ~
git clone <repo-url> track-cashflow
cd track-cashflow
npm install

npm run db:start      # Supabase stack in Docker. The first run downloads the images (~3.5 GB on disk)
cp .env.example .env  # local values are pre-filled. Compare them with: npm run db:status -- -o env
```

Edit `.env` to choose the AI provider. Either set `ANTHROPIC_API_KEY` (Claude), or set `AI_PROVIDER=ollama` and follow [docs/local-ai-setup.md](docs/local-ai-setup.md) to run a vision model on your GPU. Then:

```bash
npm run dev
```

Open **http://localhost:3000** and sign in with **any email address**. No real email is sent. Open Mailpit at **http://127.0.0.1:54324** in the same browser and click the link in the "Your sign-in link" message.

### Everyday commands

| Command | What it does |
|---|---|
| `npm run db:start` | Start the local Supabase stack (Postgres :54322, API :54321, Mailpit :54324) |
| `npm run db:stop` | Stop it to free its RAM (about 0.4 GB idle, more under load). Data is kept |
| `npm run db:status` | Show URLs and keys (`npm run db:status -- -o env` for `.env` format) |
| `npm run db:reset` | **Wipe all local data** and re-apply `supabase/migrations/` |
| `npm run db:studio` | Browse the database with Drizzle Studio (Supabase Studio is disabled to save RAM) |

The `db:*` scripts only call `npx -y supabase@2.107.0 …`, so they also work from plain PowerShell. You'd need a Windows-side clone with Windows Node for that, and file watching is slower there. Schema changes go in a new file under `supabase/migrations/` and are applied with `npm run db:reset`. Local stack settings (enabled services, auth redirect URLs, the private `receipts` bucket) live in `supabase/config.toml`. Restart with `db:stop` + `db:start` after editing it.

### Testing on your phone (same Wi-Fi)

1. Find the laptop's Wi-Fi IPv4 address (`ipconfig` in PowerShell), e.g. `192.168.1.23`.
2. The phone's browser talks to Supabase directly, so `127.0.0.1` won't work there:
   - in `.env`, set `NUXT_PUBLIC_SUPABASE_URL=http://192.168.1.23:54321`
   - in `supabase/config.toml`, add `"http://192.168.1.23:3000/**"` to `additional_redirect_urls`
   - restart: `npm run db:stop && npm run db:start`, then `npm run dev -- --host`
3. Make the laptop reachable. Use WSL mirrored networking ([docs/local-ai-setup.md, Option A](docs/local-ai-setup.md#option-a-recommended-mirrored-networking)), then allow the ports from an **admin** PowerShell:

   ```powershell
   New-NetFirewallRule -DisplayName "Track Cashflow dev" -Direction Inbound -Protocol TCP -LocalPort 3000,54321,54324 -Action Allow -Profile Private
   New-NetFirewallHyperVRule -Name "TrackCashflowDev" -DisplayName "Track Cashflow dev (WSL)" -Direction Inbound -VMCreatorId '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}' -Protocol TCP -LocalPorts 3000 -Action Allow
   ```

4. On the phone, open `http://192.168.1.23:3000` and request a link. Then open Mailpit **on the phone** at `http://192.168.1.23:54324`. The link in the email starts with `http://127.0.0.1:54321/...`, so change `127.0.0.1` to `192.168.1.23` before opening it. Open it in the same phone browser, because the login is tied to the browser that asked for the link.
5. The **Camera** tab needs HTTPS (browsers only allow camera access on `localhost` or https). Use the **Upload** tab instead: the phone's file picker can still take a photo.

## Deployment

Hosted on Vercel with a hosted Supabase project. See the "Hosted" block in `.env.example` for the variables and one-time setup: apply `supabase/migrations/`, create a private `receipts` bucket, and set the auth redirect URLs. CI (`.github/workflows/ci.yml`) runs `npm ci`, type check and build on every push. `AI_PROVIDER=ollama` only works locally; a Vercel deployment can't reach your laptop.

More detail for contributors: [CLAUDE.md](CLAUDE.md).
