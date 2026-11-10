import { createClient } from '@supabase/supabase-js'

let _client: ReturnType<typeof createClient> | null = null

/** Service-role client (bypasses RLS) — server only, used for the private `receipts` storage bucket */
export function useSupabaseAdmin() {
  if (!_client) {
    const config = useRuntimeConfig()
    if (!config.public.supabaseUrl || !config.supabaseServiceKey) {
      throw new Error('Supabase admin client needs NUXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see `supabase status`)')
    }
    _client = createClient(
      config.public.supabaseUrl,
      config.supabaseServiceKey,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
  }
  return _client
}
