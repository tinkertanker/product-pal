-- Product Pal: server-side progress (for the facilitator's /admin page) and settings.
-- Apply locally:  npx wrangler d1 migrations apply product-pal --local
-- Apply in prod:  npx wrangler d1 migrations apply product-pal --remote

CREATE TABLE IF NOT EXISTS participants (
  client_id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  canvas TEXT NOT NULL,
  done TEXT NOT NULL,
  build_prompt_length INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS participants_updated_at ON participants (updated_at);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
