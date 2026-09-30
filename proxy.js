import { next } from '@vercel/functions';
import { validSession } from './lib/session.js';

const publicPaths = new Set([
  '/', '/index.html', '/logo-r2.png', '/imagem-2r.jpg', '/icone.svg',
  '/manifest.webmanifest', '/service-worker.js', '/api/login',
  '/api/session', '/api/logout'
]);

export default function proxy(request) {
  const { pathname } = new URL(request.url);
  if (publicPaths.has(pathname)) return next();
  if (validSession(request)) return next();
  if (pathname.startsWith('/api/')) {
    return Response.json({ error: 'Faça login para continuar.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  return Response.redirect(new URL('/?login=1', request.url), 303);
}