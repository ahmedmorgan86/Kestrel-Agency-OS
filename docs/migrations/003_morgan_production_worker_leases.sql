-- Recover Neon production runs when a local Ollama worker exits unexpectedly.
-- Apply only to the isolated review branch while testing; production is untouched.
ALTER TABLE morgan_production_runs
  ADD COLUMN IF NOT EXISTS worker_id text,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_morgan_production_runs_claim
  ON morgan_production_runs (organization_id, status, lease_expires_at, created_at);
