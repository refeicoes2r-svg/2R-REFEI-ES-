import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'r2_session';
export const SESSION_SECONDS = 8 * 60 * 60;

function signature(value, secret) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

export function createSession(email, secret) {
  const payload = Buffer.from(JSON.stringify({ email: email.toLowerCase(), exp: Date.now() + SESSION_SECONDS * 1000 })).toString('base64url');
  return `${payload}.${signature(payload, secret)}`;
}

export function validSession(request) {
  const secret = process.env.AUTH_SESSION_SECRET;
  const allowedEmail = String(process.env.APP_LOGIN_EMAIL || '').trim().toLowerCase();
  if (!secret || secret.length < 32 || !allowedEmail) return false;
  const header = typeof request.headers?.get === 'function' ? request.headers.get('cookie') : request.headers?.cookie;
  const cookie = String(header || '').split(';').map(value => value.trim()).find(value => value.startsWith(`${SESSION_COOKIE}=`));
  if (!cookie) return false;
  const token = cookie.slice(SESSION_COOKIE.length + 1);
  const separator = token.lastIndexOf('.');
  if (separator < 1) return false;
  const payload = token.slice(0, separator);
  const actual = Buffer.from(token.slice(separator + 1));
  const expected = Buffer.from(signature(payload, secret));
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.email === allowedEmail && Number(data.exp) > Date.now();
  } catch {
    return false;
  }
}