-- Phase 10: Stripe Billing
-- usage_counters and subscriptions tables

-- ============================================================
-- USAGE COUNTERS
-- Per-org per-month counters; UPSERT incremented atomically.
-- ============================================================
CREATE TABLE usage_counters (
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period_start    DATE NOT NULL,                  -- first day of the calendar month
  docs_uploaded   INT NOT NULL DEFAULT 0,
  ai_analyses     INT NOT NULL DEFAULT 0,
  storage_bytes   BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, period_start)
);

-- ============================================================
-- SUBSCRIPTIONS
-- One row per paying org; driven by Stripe webhook events.
-- ============================================================
CREATE TABLE subscriptions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_sub_id       TEXT NOT NULL UNIQUE,
  stripe_price_id     TEXT NOT NULL,
  status              TEXT NOT NULL CHECK (status IN ('active','past_due','canceled','trialing')),
  current_period_end  TIMESTAMPTZ NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
