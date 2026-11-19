/** Executed in the authenticated workspace schema by initWorkspaceData. */
export const customModuleSchema = `
CREATE TABLE IF NOT EXISTS crm_custom_modules (
 id text PRIMARY KEY, definition jsonb NOT NULL, version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS crm_custom_records (
 id text PRIMARY KEY, module_id text NOT NULL REFERENCES crm_custom_modules(id),
 title text NOT NULL, payload jsonb NOT NULL DEFAULT '{}', version integer NOT NULL DEFAULT 1,
 created_by text NOT NULL, updated_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS crm_custom_records_module ON crm_custom_records(module_id) WHERE deleted_at IS NULL;
`;
