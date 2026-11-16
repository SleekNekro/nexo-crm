import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { persistPhotos, readPhoto } from '../src/infrastructure/photo-storage.ts';
import { validPhotoSource } from '../src/domain/photo-source.ts';
test('fotos persistentes, deduplicadas y verificadas; rechaza rutas y ficheros ausentes', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'nexo-photos-'));
  const old = process.env.UPLOAD_DIR;
  process.env.UPLOAD_DIR = dir;
  try {
    const src =
      'data:image/jpeg;base64,' + Buffer.from([255, 216, 1, 2, 255, 217]).toString('base64');
    const d = { siteReports: [{ photos: [{ src }, { src }] }] };
    const n = await persistPhotos(d);
    assert.equal((await readdir(dir)).length, 1);
    assert.equal(n.siteReports[0].photos[0].src, n.siteReports[0].photos[1].src);
    assert.ok(validPhotoSource(n.siteReports[0].photos[0].src));
    assert.deepEqual(await persistPhotos(n), n);
    assert.equal((await readPhoto(n.siteReports[0].photos[0].src.split('/').at(-1))).length, 6);
    assert.equal(await readPhoto('../etc/passwd'), null);
    assert.equal(validPhotoSource('/api/photos/../../etc/passwd'), false);
    assert.equal(d.siteReports[0].photos[0].src, src);
    await assert.rejects(() =>
      persistPhotos({ siteReports: [{ photos: [{ src: '/api/photos/' + '0'.repeat(64) }] }] }),
    );
    await assert.rejects(() =>
      persistPhotos({ siteReports: [{ photos: [{ src: 'data:image/jpeg;base64,AAAA' }] }] }),
    );
  } finally {
    if (old === undefined) delete process.env.UPLOAD_DIR;
    else process.env.UPLOAD_DIR = old;
    await rm(dir, { recursive: true, force: true });
  }
});
