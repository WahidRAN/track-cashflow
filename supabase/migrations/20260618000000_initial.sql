-- Track Cashflow — initial schema
--
-- Every object is schema-qualified: some statements (the auth.users trigger)
-- run as GoTrue's role, whose search_path is `auth`, not `public`.
-- Re-runnable: safe to paste into the Supabase SQL editor more than once.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  icon TEXT,
  color TEXT
);

-- Profiles (mirrors auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  store_name TEXT NOT NULL,
  store_address TEXT,
  receipt_datetime TIMESTAMPTZ NOT NULL,
  subtotal NUMERIC(10,2),
  tax_total NUMERIC(10,2),
  total NUMERIC(10,2) NOT NULL,
  -- Storage object path in the private `receipts` bucket: <user_id>/<receipt_id>/original.<ext>
  -- (served to the browser through GET /api/receipts/:id/image)
  image_url TEXT,
  raw_text TEXT,
  input_method TEXT NOT NULL DEFAULT 'camera',
  processing_status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS receipts_user_datetime_idx
  ON public.receipts(user_id, receipt_datetime DESC);

CREATE TABLE IF NOT EXISTS public.receipt_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id UUID NOT NULL REFERENCES public.receipts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Line order on the receipt (0-based)
  position INTEGER NOT NULL DEFAULT 0,
  raw_name TEXT NOT NULL,
  -- Normalized "product + size", brand removed (e.g. "milk 1 litre").
  -- Price history = earlier items of the same user with the identical value.
  generalized_name TEXT NOT NULL,
  brand_name TEXT,
  quantity NUMERIC(6,2) DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL,
  line_total NUMERIC(10,2) NOT NULL,
  tax_amount NUMERIC(10,2) DEFAULT 0,
  category_id UUID REFERENCES public.categories(id),
  category_name TEXT,
  price_indicator TEXT,
  price_percent_diff NUMERIC(6,2),
  historical_avg_price NUMERIC(10,2),
  similar_items_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Exact-match price history lookups: WHERE user_id = ? AND generalized_name = ?
CREATE INDEX IF NOT EXISTS receipt_items_user_name_idx
  ON public.receipt_items(user_id, generalized_name);
CREATE INDEX IF NOT EXISTS receipt_items_receipt_id_idx ON public.receipt_items(receipt_id);
CREATE INDEX IF NOT EXISTS receipt_items_category_idx ON public.receipt_items(category_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- The Nuxt server connects as the table owner (DATABASE_URL) and the storage
-- service role, both of which bypass RLS; these policies only guard the
-- public Data API (anon / authenticated keys).
-- ---------------------------------------------------------------------------

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Categories are readable by signed-in users" ON public.categories;
CREATE POLICY "Categories are readable by signed-in users" ON public.categories
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can manage own profile" ON public.profiles;
CREATE POLICY "Users can manage own profile" ON public.profiles
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "Users can manage own receipts" ON public.receipts;
CREATE POLICY "Users can manage own receipts" ON public.receipts
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can manage own items" ON public.receipt_items;
CREATE POLICY "Users can manage own items" ON public.receipt_items
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Auto-create profile on signup
-- Runs as GoTrue's role (search_path = auth), so it must pin search_path and
-- schema-qualify everything, or signup fails with
-- "Database error saving new user" / relation "profiles" does not exist.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (new.id, new.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill profiles for users that existed before this migration
INSERT INTO public.profiles (id)
SELECT id FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  new.updated_at = pg_catalog.now();
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS receipts_updated_at ON public.receipts;
CREATE TRIGGER receipts_updated_at
  BEFORE UPDATE ON public.receipts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ---------------------------------------------------------------------------
-- Seed categories
-- ---------------------------------------------------------------------------

INSERT INTO public.categories (name, icon, color) VALUES
  ('Groceries', '🛒', 'green'),
  ('Personal Care', '🧴', 'pink'),
  ('Household', '🏠', 'blue'),
  ('Pharmacy', '💊', 'red'),
  ('Restaurant', '🍽️', 'orange'),
  ('Coffee', '☕', 'amber'),
  ('Clothing', '👕', 'purple'),
  ('Electronics', '📱', 'slate'),
  ('Transportation', '🚗', 'cyan'),
  ('Entertainment', '🎬', 'violet'),
  ('Other', '📦', 'gray')
ON CONFLICT (name) DO NOTHING;

-- The private `receipts` storage bucket is declared in supabase/config.toml
-- (not here — creating it in SQL makes `supabase db reset` prompt to overwrite).
-- Only the server's service-role client reads/writes it, so it needs no policies.
