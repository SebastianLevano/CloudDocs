-- Phase 11: Activity Logs + Notifications

-- ============================================================
-- ACTIVITY LOGS (audit trail, org-scoped)
-- ============================================================
CREATE TABLE activity_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,             -- 'document.uploaded', 'document.ready', ...
  target_type TEXT,                      -- 'document' | 'folder' | 'share' | 'comment'
  target_id   UUID,
  metadata    JSONB NOT NULL DEFAULT '{}',
  ip          INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_activity_org_created ON activity_logs(org_id, created_at DESC);
CREATE INDEX idx_activity_action ON activity_logs(org_id, action);

-- ============================================================
-- NOTIFICATIONS (in-app, user-scoped within an org)
-- ============================================================
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,             -- 'document.ready' | 'comment.added' | etc.
  title       TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications(user_id) WHERE read_at IS NULL;
