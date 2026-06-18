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

  supabase: {
    redirectOptions: {
      login: '/auth/login',
      callback: '/auth/confirm',
      exclude: ['/auth/*'],
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
    voyageApiKey: process.env.VOYAGE_API_KEY || '',
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    databaseUrl: process.env.DATABASE_URL || '',
    public: {
      supabaseUrl: process.env.NUXT_PUBLIC_SUPABASE_URL || '',
      supabaseKey: process.env.NUXT_PUBLIC_SUPABASE_ANON_KEY || '',
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
