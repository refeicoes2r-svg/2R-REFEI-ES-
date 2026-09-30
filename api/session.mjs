import { validSession } from '../lib/session.js';

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido.' });
  if (!validSession(req)) return res.status(401).json({ authenticated: false });
  return res.status(200).json({ authenticated: true, email: process.env.APP_LOGIN_EMAIL });
}