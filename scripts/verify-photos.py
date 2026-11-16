import hashlib
import re
import sys
import tarfile

refs = set(line.strip() for line in sys.stdin if line.strip())
with tarfile.open(sys.argv[1], 'r:') as archive:
    members = {m.name: m for m in archive.getmembers()}
    for item in refs:
        workspace, ref = item.split('|', 1) if '|' in item else ('nexo', item)
        if workspace != 'nexo' and not re.fullmatch(r'[a-f0-9]{32}', workspace):
            raise SystemExit('Empresa de foto no válida')
        if not re.fullmatch(r'/api/photos/[a-f0-9]{64}', ref):
            if ref.startswith('data:image/jpeg;base64,'):
                continue  # Historic embedded image is already in the restored database.
            raise SystemExit('Referencia de foto no válida')
        digest = ref.rsplit('/', 1)[1]
        member = members.get('photos/' + (workspace + '/' if workspace != 'nexo' else '') + digest + '.jpg')
        if member is None or not member.isfile():
            raise SystemExit('Falta una foto referenciada en la copia')
        content = archive.extractfile(member).read()
        if hashlib.sha256(content).hexdigest() != digest:
            raise SystemExit('Una fotografía no coincide con su huella')
print(f'Fotografías referenciadas verificadas: {len(refs)}')
