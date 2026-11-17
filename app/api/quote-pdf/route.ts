import { currentUser, json, throttle } from '../../../src/infrastructure/security/auth';
import { readState } from '../../../src/infrastructure/db';
import { visibleData } from '../../../src/application/access';
import { quotePdf } from '../../../src/presentation/documents/quote-pdf';
export const runtime = 'nodejs';
export async function GET(req: Request) {
  try {
    const u = await currentUser();
    if (!u || u.mustChange) return json({ error: 'Inicia sesión' }, 401);
    if (!(await throttle('quote-pdf:' + u.id, 20, 900)))
      return json({ error: 'Espera unos minutos antes de generar más PDF.' }, 429);
    const p = new URL(req.url).searchParams;
    if (p.get('workspace') !== u.workspaceId) return json({ error: 'Espacio no válido' }, 403);
    const d = visibleData((await readState()).rows[0].data, u),
      deal = d.deals.find((x) => x.id === p.get('deal')),
      revision = deal?.versions.find((v) => v.id === p.get('revision'));
    if (!deal || !revision) return json({ error: 'Presupuesto no disponible' }, 404);
    const pdf = await quotePdf(
      deal,
      revision,
      d.companies.find((c) => c.id === deal.companyId),
      d.contacts.find((c) => c.id === deal.contactId),
    );
    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="presupuesto.pdf"',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return json({ error: 'No se pudo generar el PDF. Vuelve a intentarlo.' }, 503);
  }
}
