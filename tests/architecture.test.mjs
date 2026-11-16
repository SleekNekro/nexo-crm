import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
function files(folder) {
  return fs
    .readdirSync(folder, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory() ? files(path.join(folder, entry.name)) : [path.join(folder, entry.name)],
    )
    .filter((file) => /\.tsx?$/.test(file));
}
test('el dominio solo depende del propio dominio', () => {
  for (const file of files(path.join(root, 'src/domain'))) {
    for (const match of fs.readFileSync(file, 'utf8').matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      const ref = match[1];
      assert.ok(
        ref.startsWith('.') &&
          path
            .resolve(path.dirname(file), ref)
            .startsWith(path.join(root, 'src/domain') + path.sep),
        `${file}: dependencia externa ${ref}`,
      );
    }
  }
});
test('aplicación e infraestructura no dependen de presentación ni rutas', () => {
  for (const layer of ['application', 'infrastructure'])
    for (const file of files(path.join(root, 'src', layer)))
      for (const match of fs.readFileSync(file, 'utf8').matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        const ref = match[1];
        if (ref.startsWith('.')) {
          const resolved = path.resolve(path.dirname(file), ref);
          assert.ok(
            !resolved.startsWith(path.join(root, 'src/presentation')) &&
              !resolved.startsWith(path.join(root, 'app') + path.sep),
            `${file}: dependencia invertida ${ref}`,
          );
        }
      }
});
