import { visibleData } from '../../../../src/application/access';
import { readState } from '../../../../src/infrastructure/db';
import { readPhoto } from '../../../../src/infrastructure/photo-storage';
import { currentUser } from '../../../../src/infrastructure/security/auth';
export const runtime = 'nodejs';
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const user = await currentUser();
    if (!user || user.mustChange) return new Response('Inicia sesión', { status: 401 });
    if (
      new URL(_req.url).searchParams.get('workspace') &&
      new URL(_req.url).searchParams.get('workspace') !== user.workspaceId
    )
      return new Response('Espacio no autorizado', { status: 403 });
    const r = await readState();
    if (!r.rowCount) return new Response('Foto no encontrada', { status: 404 });
    const d = visibleData(r.rows[0].data, user);
    if (
      ![...(d.siteReports || []), ...(d.laborReports || [])].some((r) =>
        r.photos.some((p) => p.src === '/api/photos/' + id),
      )
    )
      return new Response('Foto no encontrada', { status: 404 });
    const photo = await readPhoto(id, user.workspaceId);
    if (!photo) return new Response('Foto no encontrada', { status: 404 });
    return new Response(new Uint8Array(photo), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': String(photo.length),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('No se puede leer la foto', { status: 503 });
  }
}
