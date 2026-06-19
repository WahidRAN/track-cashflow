-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Categories
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  icon TEXT,
  color TEXT
);

-- Profiles (mirrors auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Receipts
CREATE TABLE IF NOT EXISTS receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  store_name TEXT NOT NULL,
  store_address TEXT,
  receipt_datetime TIMESTAMPTZ NOT NULL,
  subtotal NUMERIC(10,2),
  tax_total NUMERIC(10,2),
  total NUMERIC(10,2) NOT NULL,
  image_url TEXT,
  raw_text TEXT,
  input_method TEXT NOT NULL DEFAULT 'camera',
  processing_status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Receipt items with pgvector embedding
CREATE TABLE IF NOT EXISTS receipt_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id UUID NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  raw_name TEXT NOT NULL,
  generalized_name TEXT NOT NULL,
  brand_name TEXT,
  quantity NUMERIC(6,2) DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL,
  line_total NUMERIC(10,2) NOT NULL,
  tax_amount NUMERIC(10,2) DEFAULT 0,
  category_id UUID REFERENCES categories(id),
  category_name TEXT,
  embedding vector(1024),
  price_indicator TEXT,
  price_percent_diff NUMERIC(6,2),
  historical_avg_price NUMERIC(10,2),
  similar_items_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- HNSW index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS receipt_items_embedding_idx
  ON receipt_items USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS receipt_items_user_id_idx ON receipt_items(user_id);
CREATE INDEX IF NOT EXISTS receipt_items_receipt_id_idx ON receipt_items(receipt_id);
CREATE INDEX IF NOT EXISTS receipt_items_category_idx ON receipt_items(category_id);

-- Full-text search index on receipt items
ALTER TABLE receipt_items
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(generalized_name, '') || ' ' || coalesce(brand_name, '') || ' ' || coalesce(raw_name, ''))
  ) STORED;
CREATE INDEX IF NOT EXISTS receipt_items_search_idx ON receipt_items USING gin(search_vector);

-- Full-text on receipts store name
ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS store_search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', store_name)) STORED;
CREATE INDEX IF NOT EXISTS receipts_store_search_idx ON receipts USING gin(store_search_vector);

-- Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own profile" ON profiles FOR ALL USING (auth.uid() = id);
CREATE POLICY "Users can manage own receipts" ON receipts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own items" ON receipt_items FOR ALL USING (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id, display_name)
  VALUES (new.id, new.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();

-- Seed categories
INSERT INTO categories (name, icon, color) VALUES
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

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN new.updated_at = now(); RETURN new; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER receipts_updated_at
  BEFORE UPDATE ON receipts
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at();
