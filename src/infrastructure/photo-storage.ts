import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Data } from '../domain/model';
export const photoDirectory = (workspaceId = 'nexo') => {
  if (workspaceId !== 'nexo' && !/^[a-f0-9]{32}$/.test(workspaceId))
    throw Error('Espacio de fotos no válido');
  const root = path.resolve(process.env.UPLOAD_DIR || '.storage/photos');
  return workspaceId === 'nexo' ? root : path.join(root, workspaceId);
};
export async function persistPhotos(data: Data, workspaceId = 'nexo'): Promise<Data> {
  const next = structuredClone(data);
  await mkdir(photoDirectory(workspaceId), { recursive: true });
  for (const report of [...(next.siteReports || []), ...(next.laborReports || [])])
    for (const photo of report.photos) {
      if (/^\/api\/photos\/[a-f0-9]{64}$/.test(photo.src)) {
        await access(path.join(photoDirectory(workspaceId), photo.src.split('/').at(-1)! + '.jpg'));
        continue;
      }
      if (
        !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(photo.src) ||
        photo.src.length > 650000
      )
        throw Error('Foto no válida');
      const bytes = Buffer.from(photo.src.slice('data:image/jpeg;base64,'.length), 'base64');
      if (
        bytes.length < 4 ||
        bytes[0] !== 255 ||
        bytes[1] !== 216 ||
        bytes.at(-2) !== 255 ||
        bytes.at(-1) !== 217
      )
        throw Error('La foto no contiene un JPEG válido');
      const hash = createHash('sha256').update(bytes).digest('hex');
      try {
        await writeFile(path.join(photoDirectory(workspaceId), hash + '.jpg'), bytes, {
          flag: 'wx',
          mode: 0o600,
        });
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      }
      photo.src = '/api/photos/' + hash;
    }
  return next;
}
export async function readPhoto(id: string, workspaceId = 'nexo') {
  if (!/^[a-f0-9]{64}$/.test(id)) return null;
  try {
    return await readFile(path.join(photoDirectory(workspaceId), id + '.jpg'));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}
