export const companyHistorySchema = `CREATE TABLE IF NOT EXISTS crm_company_notes(
 id text PRIMARY KEY,company_id text NOT NULL REFERENCES crm_companies(id) DEFERRABLE INITIALLY DEFERRED,
 kind text NOT NULL CHECK(kind IN ('Nota','Llamada','Reunión','Correo')),text text NOT NULL CHECK(length(text) BETWEEN 1 AND 4000),
 actor_id text NOT NULL,actor_name text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
 CREATE INDEX IF NOT EXISTS crm_company_notes_company ON crm_company_notes(company_id,created_at DESC);`;
