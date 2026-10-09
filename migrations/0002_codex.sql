CREATE TABLE opaque_states (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
  deleted_at INTEGER,
  account_id TEXT NOT NULL REFERENCES provider_accounts(id),
  model_ref TEXT NOT NULL,
  adapter_version TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  cipher_blob_ref TEXT NOT NULL UNIQUE,
  expires_at INTEGER,
  content_hash TEXT NOT NULL CHECK(length(content_hash)=64)
);
CREATE INDEX opaque_account_binding ON opaque_states(account_id,model_ref,adapter_version,branch_id);
CREATE TABLE model_catalog (
  id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id),
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0), deleted_at INTEGER,
  provider_id TEXT NOT NULL, model_id TEXT NOT NULL, catalog_version TEXT NOT NULL,
  capabilities_json TEXT NOT NULL CHECK(json_valid(capabilities_json)),
  price_json TEXT, verification TEXT NOT NULL CHECK(verification IN ('documented','probed','failed')),
  verified_at INTEGER, UNIQUE(provider_id,model_id,catalog_version)
);
