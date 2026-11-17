import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'node:crypto';
import { appCsp } from './src/infrastructure/security/csp';
export function proxy(request: NextRequest) {
  const nonce = randomBytes(24).toString('base64');
  const policy = appCsp(nonce, process.env.NODE_ENV === 'development');
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', policy);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
export const config = { matcher: ['/', '/instalar'] };
