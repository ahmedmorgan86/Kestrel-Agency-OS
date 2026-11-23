-- Additive Neon migration for the private Morgan content production queue.
-- Applied by api/[...path].js on first authenticated request; this file documents it for review.
CREATE TABLE IF NOT EXISTS morgan_production_runs (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  niche text NOT NULL,
  audience text NOT NULL DEFAULT '',
  platform text NOT NULL,
  format text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued','researching','producing','owner_review','accepted','changes_requested','failed')),
  source_items_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  deliverable_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  parent_run_id text REFERENCES morgan_production_runs(id) ON DELETE SET NULL,
  review_note text NOT NULL DEFAULT '',
  iteration integer NOT NULL DEFAULT 1,
  error_message text NOT NULL DEFAULT '',
  created_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_morgan_production_runs_owner
  ON morgan_production_runs(organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS morgan_production_tasks (
  id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES morgan_production_runs(id) ON DELETE CASCADE,
  employee_id text NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  title text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued','running','completed','failed')),
  result_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS morgan_production_worker (
  id text PRIMARY KEY,
  model text NOT NULL,
  healthy boolean NOT NULL DEFAULT false,
  detail text NOT NULL DEFAULT '',
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS morgan_production_decisions (
  id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES morgan_production_runs(id) ON DELETE CASCADE,
  version_hash text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('accepted','changes_requested')),
  comments text NOT NULL DEFAULT '',
  decided_by_user_id text NOT NULL REFERENCES users(id),
  decided_at timestamptz NOT NULL DEFAULT now()
);
