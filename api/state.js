// GET  /api/state?since=<rev>  -> {rev} (sem mudanças) ou {rev, state}
// POST /api/state              -> grava {state} e devolve {rev, state} (ou 409 + estado do servidor)
import { loadState, saveState } from './_lib/store.js';
import { sanitize } from './_js/state.js';

function secretOk(req) {
  const want = process.env.ALIVE_SECRET;
  if (!want) return true;
  const got = req.query?.k || req.headers['x-alive-secret'] || '';
  return got === want;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (!secretOk(req)) {
    return res.status(401).json({ error: 'secret inválido' });
  }

  const channel = String(req.query?.channel || req.query?.ch || req.body?.channel || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '');

  if (req.method === 'GET') {
    const state = await loadState(channel);
    const rawSince = req.query?.since;
    const since = (rawSince !== undefined && rawSince !== '') ? Number(rawSince) : null;
    if (since !== null && Number.isFinite(since) && since === state.rev) {
      return res.status(200).json({ rev: state.rev });
    }
    return res.status(200).json({ rev: state.rev, state });
  }

  if (req.method === 'POST') {
    const incoming = sanitize(req.body?.state);
    const current = await loadState(channel);
    console.log(`[alive api/state] sync recebido para canal: #${channel || 'padrão'}, rev: ${incoming.rev}`);

    // Preserva a intenção do usuário: se o estado recebido teve alteração em música, avanço ou fila, nunca descarta como stale.
    const isUserAction = (!!incoming.now !== !!current.now) ||
      (incoming.now && current.now && (incoming.now.id !== current.now.id || (incoming.now.startedAt && incoming.now.startedAt !== current.now.startedAt))) ||
      (incoming.queue.length !== current.queue.length) ||
      (Boolean(incoming.now?.paused) !== Boolean(current.now?.paused));

    const tooOld = !isUserAction && (incoming.rev < (current.rev || 0) - 2 && (incoming.updatedAt || 0) < (current.updatedAt || 0) - 30000);
    if (tooOld) {
      return res.status(200).json({ rev: current.rev, state: current, stale: true });
    }

    const saved = sanitize(incoming);
    saved.rev = Math.max(current.rev || 0, incoming.rev || 0) + 1;
    saved.updatedAt = Date.now();
    await saveState(saved, channel);
    return res.status(200).json({ rev: saved.rev, state: saved });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'method not allowed' });
}
