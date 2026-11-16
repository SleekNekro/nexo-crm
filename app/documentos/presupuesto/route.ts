import { currentUser } from '../../../src/infrastructure/security/auth';
import { readState } from '../../../src/infrastructure/db';
import { visibleData } from '../../../src/application/access';
import { quoteDocument } from '../../../src/presentation/documents/quote-document';

export async function GET(req: Request) {
  const headers = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'private, no-store',
  };
  const fail = (message: string, status: number) =>
    new Response(
      `<!doctype html><html lang="es"><meta charset="utf-8"><title>Presupuesto</title><p>${message}</p><a href="/">Volver al CRM</a></html>`,
      { status, headers },
    );
  try {
    const user = await currentUser();
    if (!user) return fail('Inicia sesión para abrir el presupuesto.', 401);
    if (user.mustChange) return fail('Cambia tu contraseña para continuar.', 403);
    const params = new URL(req.url).searchParams;
    if (params.get('workspace') !== user.workspaceId)
      return fail(
        'Este presupuesto pertenece a otro espacio. Vuelve al CRM y selecciona su empresa.',
        409,
      );
    const state = await readState();
    const data = visibleData(state.rows[0].data, user);
    const deal = data.deals.find((d) => d.id === params.get('deal'));
    const revision = deal?.versions.find((v) => v.id === params.get('revision'));
    if (!deal || !revision) return fail('Presupuesto no disponible.', 404);
    let html = quoteDocument(
      deal,
      revision,
      data.companies.find((c) => c.id === deal.companyId),
      data.contacts.find((c) => c.id === deal.contactId && c.companyId === deal.companyId),
      '/brand/nexo-logo.svg',
    );
    html = html.replace(
      '<div class="toolbar">',
      '<div class="toolbar"><a href="/" style="color:white;margin-right:16px">← Volver al CRM</a>',
    );
    if (req.headers.get('user-agent')?.includes('NexoDesktop/')) {
      html = html.replace(
        'onclick="window.print()"',
        'onclick="location.href=\'/__native/print\'"',
      );
    }
    return new Response(html, { headers });
  } catch {
    return fail('No se pudo cargar el presupuesto. Vuelve al CRM e inténtalo de nuevo.', 503);
  }
}
