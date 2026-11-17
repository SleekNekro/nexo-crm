#!/usr/bin/env python3
"""Provision a non-superuser CRM login without exposing passwords in argv/logs."""
import argparse
import os
import re
import secrets
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--env-file', default='.env')
parser.add_argument('--project')
parser.add_argument('--db-container')
parser.add_argument('--database', default='crm')
args = parser.parse_args()
if args.database not in ('crm', 'crm_auth_check'):
    raise SystemExit('Base no permitida')

env_file = Path(args.env_file)
text = env_file.read_text()
match = re.search(r'^CRM_RUNTIME_PASSWORD=([a-f0-9]{64})$', text, re.M)
if 'CRM_RUNTIME_PASSWORD=' in text and not match:
    raise SystemExit('CRM_RUNTIME_PASSWORD debe contener 64 caracteres hexadecimales.')
password = match.group(1) if match else secrets.token_hex(32)
if not match:
    with env_file.open('a') as stream:
        stream.write('\nCRM_RUNTIME_PASSWORD=' + password + '\n')
os.chmod(env_file, 0o600)

if args.db_container:
    command = ['docker', 'exec', '-i', args.db_container]
else:
    command = ['docker', 'compose', '--env-file', str(env_file)]
    if args.project:
        command += ['-p', args.project]
    command += ['exec', '-T', 'db']

# Only application schemas change owner; never inherit the bootstrap superuser.
# PostgreSQL changes are atomic. The hex password cannot contain SQL syntax.
sql = """BEGIN;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='crm_runtime') THEN CREATE ROLE crm_runtime LOGIN; END IF; END $$;
ALTER ROLE crm_runtime INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '%s';
REVOKE crm FROM crm_runtime;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='crm_owner') THEN CREATE ROLE crm_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; END IF; END $$;
ALTER ROLE crm_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT crm_owner TO crm_runtime WITH INHERIT TRUE, SET FALSE;
DO $$ DECLARE obj record; BEGIN
 EXECUTE format('ALTER DATABASE %%I OWNER TO crm_owner',current_database());
 FOR obj IN SELECT nspname FROM pg_namespace WHERE nspname='public' OR nspname ~ '^tenant_[a-f0-9]{32}$' LOOP
  EXECUTE format('ALTER SCHEMA %%I OWNER TO crm_owner',obj.nspname);
 END LOOP;
 FOR obj IN SELECT n.nspname,c.relname,c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE (n.nspname='public' OR n.nspname ~ '^tenant_[a-f0-9]{32}$') AND c.relkind IN ('r','p','S','v','m','f') ORDER BY CASE WHEN c.relkind='S' THEN 1 ELSE 0 END LOOP
  EXECUTE format('ALTER %%s %%I.%%I OWNER TO crm_owner',CASE obj.relkind WHEN 'S' THEN 'SEQUENCE' WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' WHEN 'f' THEN 'FOREIGN TABLE' ELSE 'TABLE' END,obj.nspname,obj.relname);
 END LOOP;
END $$;
COMMIT;
""" % password
result = subprocess.run(
    command + ['psql', '-U', 'crm', '-d', args.database, '-v', 'ON_ERROR_STOP=1'],
    input=sql, text=True, capture_output=True,
)
if result.returncode:
    raise SystemExit(
        'No se ha aplicado la provisión; la transacción se ha revertido. '
        'Comprueba conexión y permisos del administrador PostgreSQL.'
    )
print('Rol de ejecución preparado: sin SUPERUSER, CREATEDB, CREATEROLE, REPLICATION ni BYPASSRLS.')
