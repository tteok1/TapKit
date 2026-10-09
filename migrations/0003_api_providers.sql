CREATE TABLE provider_accounts_next (
  id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id),
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0), deleted_at INTEGER,
  provider_id TEXT NOT NULL CHECK(provider_id IN ('codex-subscription','deepseek','hunyuan','xai','doubao','openai-compatible','anthropic-compatible')),
  label TEXT NOT NULL, auth_type TEXT NOT NULL CHECK(auth_type IN ('api_key','oauth')),
  credential_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('unconfigured','ready','expired','unavailable')),
  last_check_at INTEGER, last_error_code TEXT, priority INTEGER NOT NULL DEFAULT 0,
  api_format TEXT CHECK(api_format IN ('openai-chat','openai-responses','anthropic-messages')),
  base_url TEXT, model_id TEXT
);
INSERT INTO provider_accounts_next(id,profile_id,created_at,updated_at,revision,deleted_at,provider_id,label,auth_type,credential_id,status,last_check_at,last_error_code,priority)
SELECT id,profile_id,created_at,updated_at,revision,deleted_at,provider_id,label,auth_type,credential_id,status,last_check_at,last_error_code,priority FROM provider_accounts;
DROP TABLE provider_accounts;
ALTER TABLE provider_accounts_next RENAME TO provider_accounts;
UPDATE provider_accounts SET
  api_format=CASE provider_id WHEN 'xai' THEN 'openai-responses' ELSE 'openai-chat' END,
  base_url=CASE provider_id WHEN 'deepseek' THEN 'https://api.deepseek.com' WHEN 'hunyuan' THEN 'https://api.hunyuan.cloud.tencent.com/v1' WHEN 'xai' THEN 'https://api.x.ai/v1' WHEN 'doubao' THEN 'https://ark.cn-beijing.volces.com/api/v3' END,
  model_id=CASE provider_id WHEN 'deepseek' THEN 'deepseek-flash' WHEN 'hunyuan' THEN 'hunyuan-turbos-latest' WHEN 'xai' THEN 'grok-4.6' ELSE '' END
WHERE auth_type='api_key';
