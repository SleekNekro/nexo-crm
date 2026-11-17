import { systemPool } from '../system-db';
export const securityAuditSchema = `CREATE TABLE IF NOT EXISTS public.security_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 occurred_at timestamptz NOT NULL DEFAULT now(), actor_id text, target_id text,
 workspace_id text, event text NOT NULL, result text NOT NULL CHECK(result IN ('success','denied'))
); CREATE INDEX IF NOT EXISTS security_events_time ON public.security_events(occurred_at);`;
let lastPrune = 0;
type Event = {
  actor?: string;
  target?: string;
  workspace?: string;
  event: string;
  result?: 'success' | 'denied';
};
// Deliberately accepts identifiers only: never payloads, passwords, codes, tokens or email bodies.
export async function securityEvent(e: Event, db: Pick<typeof systemPool, 'query'> = systemPool) {
  if (Date.now() - lastPrune > 3600000) {
    await db.query(
      "DELETE FROM public.security_events WHERE occurred_at < now() - interval '180 days'",
    );
    lastPrune = Date.now();
  }
  await db.query(
    'INSERT INTO public.security_events(actor_id,target_id,workspace_id,event,result) VALUES($1,$2,$3,$4,$5)',
    [e.actor || null, e.target || null, e.workspace || null, e.event, e.result || 'success'],
  );
}
