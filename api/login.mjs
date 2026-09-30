import { createSession, SESSION_COOKIE, SESSION_SECONDS } from '../lib/session.js';
import { timingSafeEqual } from 'node:crypto';
import { checkPassword, migratePassword } from '../lib/password-store.js';

const failures = new Map();
function same(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && timingSafeEqual(left, right);
}
function json(res, status, body) { return res.status(status).json(body); }

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido.' });
  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host) return json(res, 403, { error: 'Origem não autorizada.' });
  const email = String(process.env.APP_LOGIN_EMAIL || '').trim().toLowerCase();
  const secret = String(process.env.AUTH_SESSION_SECRET || '');
  if (!email || secret.length < 32 || (!process.env.APP_LOGIN_PASSWORD && !(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN))) return json(res, 503, { error: 'O acesso ainda não foi configurado na hospedagem.' });
  const ip = String(req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const recent = (failures.get(ip) || []).filter(time => now - time < 15 * 60 * 1000);
  if (recent.length >= 8) return json(res, 429, { error: 'Muitas tentativas. Aguarde 15 minutos e tente novamente.' });
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  let passwordValid = false;
  try { passwordValid = await checkPassword(String(body.password || '')); }
  catch { return json(res, 503, { error: 'Não foi possível acessar o serviço de autenticação. Confira a configuração da hospedagem.' }); }
  const valid = same(String(body.email || '').trim().toLowerCase(), email) && passwordValid;
  if (!valid) {
    recent.push(now);
    failures.set(ip, recent);
    return json(res, 401, { error: 'E-mail ou senha incorretos.' });
  }
  failures.delete(ip);
  try { await migratePassword(String(body.password || '')); }
  catch { return json(res, 503, { error: 'Não foi possível preparar o armazenamento de senha. Tente novamente.' }); }
  const token = createSession(email, secret);
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_SECONDS}`);
  return json(res, 200, { ok: true });
}