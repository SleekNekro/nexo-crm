import { createHash, timingSafeEqual } from 'node:crypto';
export class RequestInputError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
export function trustedOrigin(req: Request, secure = false) {
  if (req.headers.get('sec-fetch-site') === 'cross-site') return false;
  const raw = req.headers.get('origin');
  if (!raw) return false;
  try {
    const origin = new URL(raw);
    return (
      ['http:', 'https:'].includes(origin.protocol) &&
      (!secure || origin.protocol === 'https:') &&
      !origin.username &&
      !origin.password &&
      !origin.search &&
      !origin.hash &&
      origin.pathname === '/' &&
      origin.host === req.headers.get('host')
    );
  } catch {
    return false;
  }
}
export function validInternalToken(provided: string, secret: string | undefined) {
  if (!secret || secret.length < 32 || provided.length > 512) return false;
  // Compare fixed-size digests; malformed Unicode must never throw on byte length.
  return timingSafeEqual(
    createHash('sha256').update(provided).digest(),
    createHash('sha256').update(secret).digest(),
  );
}
export async function readJsonObject(req: Request, maxBytes: number): Promise<Record<string, any>> {
  if (req.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json')
    throw new RequestInputError('Usa contenido JSON.', 415);
  const length = req.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes))
    throw new RequestInputError('Solicitud demasiado grande.', 413);
  const reader = req.body?.getReader();
  if (!reader) throw new RequestInputError('Solicitud JSON no válida.', 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new RequestInputError('La solicitud ha tardado demasiado.', 408)),
      10000,
    );
  });
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new RequestInputError('Solicitud demasiado grande.', 413);
      chunks.push(value);
    }
    const raw = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error();
    return value;
  } catch (e) {
    void reader.cancel().catch(() => {});
    if (e instanceof RequestInputError) throw e;
    throw new RequestInputError('Solicitud JSON no válida.', 400);
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}
