import PDFDocument from 'pdfkit';
import { Resend } from 'resend';
import { timingSafeEqual } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const attempts = new Map();
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const brl = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(number(value));
const qty = value => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(number(value));
const dateBR = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value.split('-').reverse().join('/') : '—';
const safeEqual = (a, b) => {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && timingSafeEqual(left, right);
};
const logoPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'logo-r2.png');

function makePdf({ projectName, contactName, start, end, rows }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 42, bufferPages: true, info: { Title: 'Relatório de refeições - R2 Refeições', Author: 'R2 Refeições' } });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    const green = '#163c35';
    const muted = '#64746b';
    const columns = [42, 104, 260, 324, 384, 446, 510];
    const right = 553;
    let totalQty = 0;
    let totalAmount = 0;
    rows.forEach(row => { totalQty += number(row.qty); totalAmount += number(row.amount); });

    function header() {
      doc.image(logoPath, 42, 34, { fit: [50, 56] });
      doc.fillColor(green).font('Helvetica-Bold').fontSize(16).text('Relatório por obra', 105, 42);
      doc.fillColor(muted).font('Helvetica').fontSize(9).text(`Obra: ${projectName}`, 105, 66, { width: 400 });
      if (contactName) doc.text(`Responsável: ${contactName}`, 105, 80, { width: 400 });
      doc.text(`Período: ${dateBR(start)} a ${dateBR(end)}`, 105, contactName ? 94 : 80);
      const y = contactName ? 116 : 102;
      doc.moveTo(42, y).lineTo(right, y).strokeColor('#dce5dd').stroke();
      return y + 14;
    }
    function tableHead(y) {
      doc.rect(42, y, right - 42, 23).fill('#edf3ee');
      doc.fillColor(green).font('Helvetica-Bold').fontSize(7.5);
      doc.text('DATA', columns[0] + 5, y + 8);
      doc.text('REFEIÇÃO', columns[1] + 5, y + 8);
      doc.text('PRODUÇÃO', columns[2], y + 8, { width: 58, align: 'right' });
      doc.text('ADMIN.', columns[3], y + 8, { width: 55, align: 'right' });
      doc.text('TOTAL', columns[4], y + 8, { width: 55, align: 'right' });
      doc.text('PREÇO', columns[5], y + 8, { width: 55, align: 'right' });
      doc.text('FATURAMENTO', columns[6] - 5, y + 8, { width: right - columns[6] + 5, align: 'right' });
      return y + 23;
    }
    let y = tableHead(header());
    for (const row of rows) {
      if (y > 745) { doc.addPage(); y = tableHead(header()); }
      const rowHeight = 22;
      doc.fillColor('#27372f').font('Helvetica').fontSize(8);
      doc.text(dateBR(row.date), columns[0] + 5, y + 7, { width: 57 });
      doc.text(row.meal === 'almoco' ? 'Almoço' : 'Jantar', columns[1] + 5, y + 7, { width: 150 });
      doc.text(qty(row.production), columns[2], y + 7, { width: 58, align: 'right' });
      doc.text(qty(row.admin), columns[3], y + 7, { width: 55, align: 'right' });
      doc.text(qty(row.qty), columns[4], y + 7, { width: 55, align: 'right' });
      doc.text(brl(row.price), columns[5] - 3, y + 7, { width: 58, align: 'right' });
      doc.text(brl(row.amount), columns[6] - 5, y + 7, { width: right - columns[6] + 5, align: 'right' });
      doc.moveTo(42, y + rowHeight).lineTo(right, y + rowHeight).strokeColor('#e7ece7').stroke();
      y += rowHeight;
    }
    if (y > 735) { doc.addPage(); y = header() + 15; }
    doc.moveTo(42, y + 7).lineTo(right, y + 7).strokeColor(green).lineWidth(1.2).stroke();
    doc.fillColor(green).font('Helvetica-Bold').fontSize(9).text('TOTAL DO PERÍODO', 47, y + 17);
    doc.text(qty(totalQty), columns[4], y + 17, { width: 55, align: 'right' });
    doc.text(brl(totalAmount), columns[6] - 5, y + 17, { width: right - columns[6] + 5, align: 'right' });
    doc.end();
  });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (origin && new URL(origin).host !== host) return res.status(403).json({ error: 'Origem não autorizada.' });
  const now = Date.now();
  const ip = String(req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  const recent = (attempts.get(ip) || []).filter(time => now - time < 60 * 60 * 1000);
  if (recent.length >= 8) return res.status(429).json({ error: 'Limite de envios atingido. Tente novamente mais tarde.' });
  recent.push(now);
  attempts.set(ip, recent);

  const { RESEND_API_KEY, EMAIL_FROM, EMAIL_SEND_PIN } = process.env;
  if (!RESEND_API_KEY || !EMAIL_FROM || !EMAIL_SEND_PIN) return res.status(503).json({ error: 'Integração de e-mail ainda não configurada no servidor.' });
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  if (!safeEqual(body.pin, EMAIL_SEND_PIN)) return res.status(401).json({ error: 'Código de envio inválido.' });
  const { to, contactName = '', projectName, start, end, rows } = body;
  if (typeof to !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || to.length > 254) return res.status(400).json({ error: 'E-mail da obra inválido.' });
  if (typeof projectName !== 'string' || projectName.length > 160 || !Array.isArray(rows) || rows.length < 1 || rows.length > 3000) return res.status(400).json({ error: 'Dados do relatório inválidos.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start || '') || !/^\d{4}-\d{2}-\d{2}$/.test(end || '') || start > end) return res.status(400).json({ error: 'Período do relatório inválido.' });
  const cleanRows = rows.map(row => ({ date: row.date, meal: row.meal, production: number(row.production), admin: number(row.admin), qty: number(row.qty), price: number(row.price), amount: number(row.amount) }));
  if (cleanRows.some(row => !/^\d{4}-\d{2}-\d{2}$/.test(row.date || '') || row.date < start || row.date > end || !['almoco', 'jantar'].includes(row.meal) || [row.production, row.admin, row.qty, row.price, row.amount].some(value => value < 0 || !Number.isFinite(value)))) return res.status(400).json({ error: 'Há lançamentos inválidos no relatório.' });
  try {
    const pdf = await makePdf({ projectName, contactName: String(contactName).slice(0, 120), start, end, rows: cleanRows });
    const fmt = value => value.split('-').reverse().join('-');
    const resend = new Resend(RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: [to],
      subject: `Relatório de refeições - ${projectName} (${fmt(start)} a ${fmt(end)})`,
      text: `Olá${contactName ? `, ${contactName}` : ''}.\n\nSegue em anexo o relatório detalhado de refeições da obra ${projectName}, referente ao período de ${fmt(start)} a ${fmt(end)}.\n\nR2 Refeições`,
      attachments: [{ filename: `relatorio-refeicoes-${start}-a-${end}.pdf`, content: pdf.toString('base64') }]
    });
    if (error) throw new Error(error.message || 'Falha no serviço de e-mail.');
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('send-report failed:', error.message);
    return res.status(502).json({ error: 'O serviço não conseguiu enviar o relatório. Confira o remetente e a chave de e-mail.' });
  }
}