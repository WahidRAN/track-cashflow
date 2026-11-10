// nuxt.config.ts
import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: true },

  app: {
    head: {
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
        { name: 'theme-color', content: '#10b981' },
      ],
      link: [
        { rel: 'apple-touch-icon', href: '/icons/pwa-192.png' },
      ],
    },
  },

  modules: [
    '@nuxt/ui',
    '@nuxtjs/supabase',
    '@vite-pwa/nuxt',
  ],

  ui: {
    // Use the system font stack instead of downloading web fonts, so the app
    // works fully offline/locally and loads faster on phones
    fonts: false,
  },

  icon: {
    // Serve icons from the locally installed @iconify-json/* sets only — never
    // fall back to the remote Iconify API
    serverBundle: { collections: ['heroicons', 'lucide'], remote: false },
    // Inline the icons referenced in app/ so SSR and first paint need no icon request
    clientBundle: { scan: true },
    fallbackToApi: false,
  },

  supabase: {
    // No generated database types — the server talks to Postgres via Drizzle
    types: false,
    redirectOptions: {
      login: '/auth/login',
      callback: '/auth/confirm',
      exclude: ['/auth/*'],
      // Return to the page the user wanted after the magic-link round trip
      saveRedirectToCookie: true,
    },
    cookieOptions: {
      maxAge: 60 * 60 * 24 * 30,
      sameSite: 'lax',
      // Secure cookies are dropped over plain http (e.g. http://192.168.x.x from a phone),
      // so only require them in production builds served over https.
      secure: process.env.NODE_ENV === 'production',
    },
  },

  pwa: {
    manifest: {
      name: 'Track Cashflow',
      short_name: 'Cashflow',
      description: 'Smart receipt tracking for household spending',
      theme_color: '#10b981',
      background_color: '#ffffff',
      display: 'standalone',
      orientation: 'portrait',
      icons: [
        { src: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
      runtimeCaching: [
        {
          urlPattern: /^https:\/\/.*\.supabase\.co\/.*/,
          handler: 'NetworkFirst',
          options: {
            cacheName: 'supabase-cache',
            expiration: { maxAgeSeconds: 300 },
          },
        },
      ],
    },
    devOptions: {
      enabled: false,
    },
  },

  runtimeConfig: {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    databaseUrl: process.env.DATABASE_URL || '',
    // Receipt extraction provider: 'claude' (default) or 'ollama' (local)
    aiProvider: process.env.AI_PROVIDER || 'claude',
    claudeModel: process.env.CLAUDE_MODEL || 'claude-opus-4-5',
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    ollamaModel: process.env.OLLAMA_MODEL || 'qwen2.5vl:7b',
    public: {
      supabaseUrl: process.env.NUXT_PUBLIC_SUPABASE_URL || '',
      supabaseKey: process.env.NUXT_PUBLIC_SUPABASE_ANON_KEY || '',
      // Display currency (ISO 4217) and number/date locale for the UI
      currency: process.env.NUXT_PUBLIC_CURRENCY || 'JPY',
      locale: process.env.NUXT_PUBLIC_LOCALE || 'en-US',
      // Fallback timezone for receipt times printed without an offset
      timezone: process.env.NUXT_PUBLIC_TIMEZONE || 'Asia/Tokyo',
    },
  },

  css: ['~/assets/css/main.css'],

  typescript: {
    tsConfig: {
      compilerOptions: {},
    },
  },

  alias: {
    '~/db': fileURLToPath(new URL('./db', import.meta.url)),
    '~/types': fileURLToPath(new URL('./types', import.meta.url)),
    '~/server': fileURLToPath(new URL('./server', import.meta.url)),
  },
})
