-- Reuse budgets; reserve domain IDs without inventing a second run state before P02.
CREATE TABLE provider_attempts (
 id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id),
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
 deleted_at INTEGER, run_id TEXT NOT NULL, root_run_id TEXT NOT NULL, project_id TEXT,
 logical_call_id TEXT NOT NULL, attempt_no INTEGER NOT NULL CHECK(attempt_no>0),
 provider_account_id TEXT NOT NULL REFERENCES provider_accounts(id), provider_id TEXT NOT NULL,
 model_ref TEXT NOT NULL, request_fingerprint TEXT NOT NULL, native_state_ref TEXT,
 status TEXT NOT NULL CHECK(status IN ('running','completed','interrupted','failed','cancelled','unknown')),
 error_code TEXT, upstream_request_id TEXT, usage_json TEXT,
 reserved_tokens INTEGER NOT NULL CHECK(reserved_tokens>=0),
 is_active_answer INTEGER NOT NULL DEFAULT 0 CHECK(is_active_answer IN (0,1)),
 public_text TEXT NOT NULL DEFAULT '', budget_day TEXT NOT NULL,
 price_json TEXT, reserved_money_micros INTEGER, currency TEXT,
 UNIQUE(logical_call_id,attempt_no)
);
CREATE UNIQUE INDEX active_logical_answer ON provider_attempts(logical_call_id) WHERE is_active_answer=1;
CREATE TABLE usage_ledger (
 id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id), created_at INTEGER NOT NULL,
 provider_attempt_id TEXT NOT NULL UNIQUE REFERENCES provider_attempts(id), root_run_id TEXT NOT NULL,
 account_id TEXT NOT NULL REFERENCES provider_accounts(id), input_tokens INTEGER, cached_input_tokens INTEGER,
 output_tokens INTEGER, reasoning_tokens INTEGER, charged_tokens INTEGER NOT NULL CHECK(charged_tokens>=0),
 source TEXT NOT NULL CHECK(source IN ('actual','estimated')), price_version TEXT, currency TEXT, amount_micros INTEGER
);
CREATE INDEX usage_filter ON provider_attempts(profile_id,created_at,project_id,model_ref,run_id);
CREATE TABLE provider_route_state (
 account_id TEXT PRIMARY KEY REFERENCES provider_accounts(id), profile_id TEXT NOT NULL REFERENCES profiles(id),
 disabled_until INTEGER, account_revision INTEGER NOT NULL, error_code TEXT NOT NULL
);
