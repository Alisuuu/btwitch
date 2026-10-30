// GET  /api/state?since=<rev>  -> {rev} (sem mudanças) ou {rev, state}
// POST /api/state              -> grava {state} e devolve {rev, state} (ou 409 + estado do servidor)
//
// Conflitos: o estado é gravado por inteiro (último escritor vence), o que
// descartava pedidos de música feitos enquanto o cliente estava com um snapshot
// antigo (ex.: widget com 5s de atraso apagava música recém-pedida no chat).
// Agora, quando o rev recebido é mais antigo que o do servidor, em vez de
// sobrescrever fazemos um merge conservador (ver mergeStates).
import { loadState, saveState } from './_lib/store.js';
import { sanitize } from '../js/state.js';

function secretOk(req) {
  const want = process.env.ALIVE_SECRET;
  if (!want) return true;
  const got = req.query?.k || req.headers['x-alive-secret'] || '';
  return got === want;
}

// A chave da API de IA é segredo do navegador do usuário: fica no localStorage do
// painel e viaja só no POST /api/ai por request. O servidor nunca guarda nem serve.
function stripSecrets(state) {
  if (state?.config?.ai?.apiKey) {
    const clone = JSON.parse(JSON.stringify(state));
    clone.config.ai.apiKey = '';
    return clone;
  }
  return state;
}

// Combina um estado atrasado (incoming) sobre o estado atual do servidor.
// Regras: o servidor é a base; só intenções claras e compatíveis são aplicadas.
export function mergeStates(current, incoming) {
  if (!current || !incoming) return current || incoming || null;

  // Escrita baseada no estado atual do servidor (rev igual ou maior): aceita como antes.
  if ((incoming.rev || 0) >= (current.rev || 0)) {
    const out = sanitize(incoming);
    out.rev = Math.max(current.rev || 0, incoming.rev || 0) + 1;
    out.updatedAt = Date.now();
    return out;
  }

  // ---- rev do cliente mais antigo: merge conservador sobre o estado do servidor ----
  const out = JSON.parse(JSON.stringify(current));
  out.stats = out.stats || { played: 0, requested: 0 };
  out.history = Array.isArray(out.history) ? out.history : [];
  out.queue = Array.isArray(out.queue) ? out.queue : [];

  // 1) Fim de vídeo no widget: o cliente avançou para a música que está no fim da fila
  //    do servidor -> avança de verdade (senão o player ficaria travado em "morte silenciosa").
  if (incoming.now && out.now && incoming.now.id !== out.now.id && out.queue[0]?.id === incoming.now.id) {
    out.history.unshift({ ...out.now, finishedAt: Date.now() });
    out.history = out.history.slice(0, 30);
    out.stats.played = (out.stats.played || 0) + 1;
    out.now = { ...incoming.now, position: 0, paused: false, startedAt: incoming.now.startedAt || Date.now() };
    out.queue = out.queue.slice(1);
    out.skip = null; // votos eram da música anterior
  } else if (!out.now && incoming.now) {
    // Cliente começou uma música que o servidor ainda não via.
    out.now = incoming.now;
    out.skip = null;
  }

  // 2) Pedidos novos: união da fila por id — nunca descarta o que o servidor já tem.
  const known = new Set([out.now?.id, ...out.queue.map((i) => i && i.id)].filter(Boolean));
  for (const it of incoming.queue || []) {
    if (it && it.id && !known.has(it.id)) {
      known.add(it.id);
      out.queue.push(it);
    }
  }

  // 3) Votos de skip: união (quando é da mesma música).
  if (incoming.skip && out.skip && incoming.skip.id === out.skip.id) {
    out.skip = { id: out.skip.id, votes: [...new Set([...(out.skip.votes || []), ...(incoming.skip.votes || [])])].slice(0, 100) };
  } else if (incoming.skip && !out.skip && out.now && incoming.skip.id === out.now.id) {
    out.skip = { id: out.skip.id, votes: (incoming.skip.votes || []).slice(0, 100) };
  }

  // 4) Volume: intenção simples de UI, mas não regride se o incoming for mais antigo.
  //    Config: só se o cliente for mais recente que o servidor.
  if (Number.isFinite(Number(incoming.volume)) && (incoming.updatedAt || 0) >= (current.updatedAt || 0)) {
    out.volume = Number(incoming.volume);
  }
  if (incoming.config && (incoming.updatedAt || 0) > (current.updatedAt || 0)) out.config = incoming.config;

  // 5) Estatísticas: fica sempre com o maior contador.
  out.stats.played = Math.max(out.stats.played || 0, Number(incoming.stats?.played) || 0);
  out.stats.requested = Math.max(out.stats.requested || 0, Number(incoming.stats?.requested) || 0);

  out.rev = (current.rev || 0) + 1;
  out.updatedAt = Date.now();
  return sanitize(out);
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
    const state = stripSecrets(await loadState(channel));
    const rawSince = req.query?.since;
    const since = (rawSince !== undefined && rawSince !== '') ? Number(rawSince) : null;
    if (since !== null && Number.isFinite(since) && since === state.rev) {
      return res.status(200).json({ rev: state.rev });
    }
    return res.status(200).json({ rev: state.rev, state });
  }

  if (req.method === 'POST') {
    const incoming = stripSecrets(sanitize(req.body?.state));
    const current = await loadState(channel);
    console.log(`[alive api/state] sync recebido para canal: #${channel || 'padrão'}, rev do cliente: ${incoming.rev}, rev do servidor: ${current.rev}`);

    const saved = mergeStates(current, incoming);

    // Nada mudou de fato (flush de snapshot atrasado): não grava, só devolve o estado do servidor.
    const fingerprint = (s) => JSON.stringify({ ...s, rev: 0, updatedAt: 0 });
    if (fingerprint(saved) === fingerprint(current)) {
      return res.status(200).json({ rev: current.rev, state: current, stale: true });
    }

    await saveState(saved, channel);
    return res.status(200).json({ rev: saved.rev, state: saved });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'method not allowed' });
}
