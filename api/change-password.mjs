import { validSession } from '../lib/session.js';
import { checkPassword, savePassword } from '../lib/password-store.js';

function json(res, status, body) { return res.status(status).json(body); }

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido.' });
  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host) return json(res, 403, { error: 'Origem não autorizada.' });
  if (!validSession(req)) return json(res, 401, { error: 'Sua sessão expirou. Entre novamente.' });
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const current = String(body.currentPassword || '');
  const next = String(body.newPassword || '');
  if (next.length < 8) return json(res, 400, { error: 'A nova senha precisa ter pelo menos 8 caracteres.' });
  if (next.length > 200) return json(res, 400, { error: 'A nova senha é muito longa.' });
  if (next !== String(body.confirmPassword || '')) return json(res, 400, { error: 'A confirmação não corresponde à nova senha.' });
  try {
    if (!await checkPassword(current)) return json(res, 401, { error: 'A senha atual está incorreta.' });
    await savePassword(next);
    return json(res, 200, { ok: true });
  } catch {
    return json(res, 503, { error: 'Configure o armazenamento persistente de senha na hospedagem e tente novamente.' });
  }
}