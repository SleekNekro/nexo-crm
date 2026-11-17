import test from 'node:test';
import assert from 'node:assert/strict';
import { appCsp, documentCsp } from '../src/infrastructure/security/csp.ts';
test('Production scripts require nonce; no generic inline/eval bypass', () => {
  const policy = appCsp('randomnonce');
  const scripts = policy.split(';').find((p) => p.trim().startsWith('script-src'));
  assert.match(scripts, /nonce-randomnonce/);
  assert.match(scripts, /strict-dynamic/);
  assert.ok(!scripts.includes("'unsafe-inline'"));
  assert.ok(!scripts.includes("'unsafe-eval'"));
  assert.match(policy, /connect-src 'self';/);
  assert.match(documentCsp(), /script-src 'unsafe-hashes' 'sha256-/);
  assert.ok(!documentCsp().includes("script-src 'unsafe-inline'"));
});
