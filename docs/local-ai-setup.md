# Local AI setup (Ollama on Windows + Nuxt in WSL2)

This guide covers running receipt extraction against a local vision model with [Ollama](https://ollama.com) instead of Claude. In this setup Ollama runs natively on Windows (so it can use the NVIDIA GPU), and the Nuxt dev server runs inside WSL2.

Reference machine: Intel i7-9750H, NVIDIA RTX 2060 6 GB VRAM, 16 GB RAM, Windows 11.

> **Limitation:** Ollama only works while the app runs on your laptop (`npm run dev` in WSL). A Vercel deployment cannot reach a model running on your machine, so production stays on `AI_PROVIDER=claude`.

---

## 1. Install Ollama on Windows

In PowerShell:

```powershell
winget install Ollama.Ollama
```

(Or download the installer from https://ollama.com/download.) Ollama starts in the system tray and listens on `http://localhost:11434`.

Make sure the NVIDIA driver is current. Check it with:

```powershell
nvidia-smi
```

## 2. Pull the models

```powershell
ollama pull qwen2.5vl:7b   # default, ~6 GB download
ollama pull qwen2.5vl:3b   # lighter fallback, ~3 GB download
```

The default tags are Q4_K_M quantized. **Don't go below Q4** (e.g. Q3/Q2 variants). Lower quantization noticeably increases misread digits, and wrong prices and totals defeat the purpose of the app.

## 3. Sanity check (Windows)

```powershell
# Model list. qwen2.5vl:7b and :3b should appear
curl.exe http://localhost:11434/api/tags

# Interactive test. You can include an image path in the prompt
ollama run qwen2.5vl:7b "What is the total on this receipt? C:\Users\<you>\Pictures\receipt.jpg"
```

While a model is loaded, `ollama ps` shows how it is split between GPU and CPU (e.g. `45%/55% CPU/GPU`).

## 4. What to expect on an RTX 2060 (6 GB)

These are **rough estimates**. Actual times depend on image size, receipt length, drivers and thermals.

| Model | Fits in 6 GB VRAM? | Time per receipt | Accuracy |
|---|---|---|---|
| `qwen2.5vl:7b` (Q4) | No, partially offloaded to CPU | ~30–90 s | Better |
| `qwen2.5vl:3b` (Q4) | Yes, fully on GPU | Noticeably faster | Lower: more misread items/prices |

The client resizes images to at most 1600 px (JPEG) before upload, which keeps the vision-token count and latency down. The first request after starting Ollama is slower because the model has to load. The server stops waiting for Ollama after 180 s. If you hit that limit regularly, switch to the 3B model.

## 5. Let WSL2 reach Ollama on Windows

By default, Nuxt in WSL2 **cannot** reach Windows `localhost`. Pick one option.

### Option A (recommended): mirrored networking

Create or edit `%UserProfile%\.wslconfig` on Windows (e.g. `notepad $env:USERPROFILE\.wslconfig`):

```ini
[wsl2]
memory=6GB
networkingMode=mirrored
```

Then restart WSL from PowerShell:

```powershell
wsl --shutdown
```

Reopen your WSL terminal and verify:

```bash
curl http://localhost:11434/api/tags
```

Use `OLLAMA_BASE_URL=http://localhost:11434`.

### Option B: expose Ollama on the Windows host IP

1. Set a Windows **user** environment variable, then fully quit Ollama (tray icon → Quit) and start it again:

   ```powershell
   setx OLLAMA_HOST 0.0.0.0
   ```

2. Find the Windows host IP from inside WSL:

   ```bash
   ip route show | grep default
   # default via 172.24.80.1 dev eth0 ...  -> host IP is 172.24.80.1
   ```

3. Windows Firewall may block the port. If so, allow it from an **admin** PowerShell. Keep it on the Private profile so it is not exposed on public Wi-Fi:

   ```powershell
   New-NetFirewallRule -DisplayName "Ollama 11434" -Direction Inbound -Protocol TCP -LocalPort 11434 -Action Allow -Profile Private
   ```

4. Verify from WSL and use that IP:

   ```bash
   curl http://172.24.80.1:11434/api/tags
   ```

   `OLLAMA_BASE_URL=http://172.24.80.1:11434`. The IP can change after a reboot, so re-check it if requests start failing.

## 6. RAM budget (16 GB)

Ollama (Windows), WSL2 (Nuxt + Node + the Docker Desktop Supabase stack) and your browser all share 16 GB.

- **Cap WSL memory** with `memory=6GB` in `.wslconfig` (above). Docker Desktop's WSL2 backend runs in the same VM, so this cap covers the Supabase containers too. Without a cap, WSL can claim up to half of RAM and keep it cached.
- **The local Supabase stack is trimmed** in `supabase/config.toml`: Studio, Realtime, Edge Functions and Analytics are off. That leaves about 0.4 GB in use while idle. Run `npm run db:stop` when you aren't using the app, and quit Docker Desktop to free its VM overhead as well.
- **Close heavy apps** (extra browser tabs, games) while processing receipts.
- **Use the Supabase cloud free tier** instead of the local stack if RAM is still tight. See the "Hosted" block in `.env.example`.
- **Drop to `qwen2.5vl:3b`** if Task Manager shows memory near 100% or the disk is busy swapping. A swapping 7B model is far slower than the 3B one.

## 7. `.env` for local mode

In the project `.env` (inside WSL):

```bash
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434   # Option B: http://<windows-host-ip>:11434
OLLAMA_MODEL=qwen2.5vl:7b                # or qwen2.5vl:3b

# Not needed when AI_PROVIDER=ollama
ANTHROPIC_API_KEY=

# Keep the Supabase "Local" block from .env.example (npm run db:start)
```

With `AI_PROVIDER=ollama` and the local Supabase stack, nothing leaves your machine. Price comparison works the same with both providers: it matches previous purchases by item name in your own database.

Restart `npm run dev` after changing `.env`.

## 8. Compare quality: Claude vs Ollama

Use the **same 5 real receipts** (mix of short/long, crisp/crumpled, different stores):

1. With `AI_PROVIDER=claude`, upload and process all 5. Note the store name, date, total and item count, plus a few item names and prices for each.
2. Switch to `AI_PROVIDER=ollama` (restart `npm run dev`), upload the same 5 images again and process them.
3. Compare per receipt:
   - **Total** matches the paper receipt (most important)
   - **Item count** and whether the item prices sum to the total
   - **Prices and quantities** with no misread digits (e.g. 8 vs 3, 1 vs 7)
   - **Store name / date** correct
   - **Time per receipt**
4. If the 7B misses totals on more than 1 of the 5, local extraction isn't reliable enough for day-to-day use on this hardware. If 7B is accurate but too slow, try 3B and repeat.

Delete the duplicate test receipts afterwards so they don't skew your monthly totals.
