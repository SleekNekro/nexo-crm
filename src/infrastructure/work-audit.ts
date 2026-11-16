import type { PoolClient } from 'pg';
import type { AuditChange } from '../application/work-audit';
import type { Identity } from '../application/access';
export const workAuditSchema = `CREATE TABLE IF NOT EXISTS crm_work_audit(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,work_id text NOT NULL,kind text NOT NULL,entity_id text NOT NULL,action text NOT NULL,reason text NOT NULL,actor_id text NOT NULL,actor_name text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),before_value jsonb,after_value jsonb); CREATE INDEX IF NOT EXISTS crm_work_audit_work_idx ON crm_work_audit(work_id,id DESC);`;
export async function recordWorkAudit(db: PoolClient, changes: AuditChange[], actor: Identity) {
  for (const c of changes)
    await db.query(
      'INSERT INTO crm_work_audit(work_id,kind,entity_id,action,reason,actor_id,actor_name,before_value,after_value) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [
        c.workId,
        c.kind,
        c.entityId,
        c.action,
        c.reason,
        actor.id,
        actor.displayName || actor.username,
        JSON.stringify(c.before),
        JSON.stringify(c.after),
      ],
    );
}
