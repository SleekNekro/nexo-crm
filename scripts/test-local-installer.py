#!/usr/bin/env python3
"""Disposable CI-only installation test; never points to an existing project."""
import json, os, pathlib, secrets, subprocess, tempfile, time, urllib.request, urllib.error
root = pathlib.Path(__file__).resolve().parent.parent
arch = os.environ.get('IMAGE_ARCH', 'amd64')
assert arch in ('amd64', 'arm64')
with tempfile.TemporaryDirectory(prefix='nexo-installer-check-') as temp:
    work = pathlib.Path(temp)
    compose = (root/'apps/server/compose.yaml').read_text()
    compose = compose.replace('0.2.0-beta.4', '0.2.0-beta.4-'+arch)
    (work/'compose.yaml').write_text(compose)
    values = {key:secrets.token_hex(32) for key in ['POSTGRES_PASSWORD','CRM_RUNTIME_PASSWORD','AUTH_ENCRYPTION_KEY','CRM_GATEWAY_TOKEN','CRM_DEPLOYMENT_ID']}
    values.update(COMPOSE_PROJECT_NAME='nexo-installer-check-'+secrets.token_hex(5),APP_PORT='8180',ADMIN_PORT='8182',CRM_PUBLIC_URL='http://localhost:8180')
    (work/'.env').write_text(''.join(f'{k}={v}\n' for k,v in values.items()))
    os.chmod(work/'.env',0o600)
    def dc(*args,stdin=None,expect_failure=False):
        result=subprocess.run(['docker','compose','--env-file','.env','-f','compose.yaml',*args],cwd=work,input=stdin,text=True,capture_output=True,timeout=240)
        if expect_failure:
            assert result.returncode != 0
            return ''
        if result.returncode: raise RuntimeError('Docker step failed: '+ ' '.join(args[:3]))
        return result.stdout.strip()
    def wait():
        for _ in range(90):
            try:
                urllib.request.urlopen('http://localhost:8180/api/auth',timeout=4).read();return
            except urllib.error.HTTPError as e:
                if e.code<500:return
            except Exception:pass
            time.sleep(2)
        raise RuntimeError('Server did not become ready')
    password=secrets.token_hex(4) # Exactly eight characters: local setup policy.
    def login(password):
        req=urllib.request.Request('http://localhost:8180/api/auth',data=json.dumps({'action':'login','username':'developer','password':password}).encode(),headers={'Content-Type':'application/json','Origin':'http://localhost:8180'},method='POST')
        with urllib.request.urlopen(req,timeout=10) as response:
            assert response.status==200
            assert any('nexo_session=' in c for c in response.headers.get_all('Set-Cookie',[]))
    try:
        dc('up','-d','--wait','--wait-timeout','120','db')
        sql=(root/'apps/server/provision.sql.template').read_text().replace('__RUNTIME_PASSWORD__',values['CRM_RUNTIME_PASSWORD'])
        dc('exec','-T','db','psql','-U','crm','-d','crm','-v','ON_ERROR_STOP=1',stdin=sql)
        dc('up','-d','--no-build');wait()
        dc('exec','-T','app','node','scripts/setup-local-admin.mjs',stdin=json.dumps({'password':'1234567'}),expect_failure=True)
        assert dc('exec','-T','db','psql','-U','crm','-d','crm','-tAc','SELECT count(*) FROM app_users')=='0'
        r=dc('exec','-T','app','node','scripts/setup-local-admin.mjs',stdin=json.dumps({'password':password}))
        assert json.loads(r)['created'] is True
        login(password)
        r=dc('exec','-T','app','node','scripts/setup-local-admin.mjs',stdin=json.dumps({'password':'a-different-password-123'}))
        assert json.loads(r)['created'] is False
        login(password)
        q=dc('exec','-T','db','psql','-U','crm','-d','crm','-tAc',"SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls FROM pg_roles WHERE rolname='crm_runtime'")
        assert q=='f'
        dc('stop');dc('up','-d','--no-build');wait();login(password)
        print('OK: installation, initial account, login, no account overwrite, unprivileged runtime and persistence after stop/start.')
    finally:
        dc('down','--volumes','--remove-orphans') # Only this randomly named disposable project.
