import { createClient } from '@supabase/supabase-js'

let _client: ReturnType<typeof createClient> | null = null

export function useSupabaseAdmin() {
  if (!_client) {
    const config = useRuntimeConfig()
    _client = createClient(
      config.public.supabaseUrl,
      config.supabaseServiceKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
  }
  return _client
}
