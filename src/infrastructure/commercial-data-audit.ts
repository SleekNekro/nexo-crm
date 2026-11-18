export const commercialDataAuditSchema = `CREATE TABLE IF NOT EXISTS crm_commercial_data_audit(
 id bigserial PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(), actor_id text NOT NULL,
 actor_name text NOT NULL, action text NOT NULL, kind text NOT NULL,
 target_id text, source_id text, detail jsonb NOT NULL);
 CREATE INDEX IF NOT EXISTS crm_commercial_data_audit_target ON crm_commercial_data_audit(target_id);`;
