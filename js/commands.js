// Alive Bot — comandos do chat. Roda na página do painel (é ela que fica conectada na Twitch).
import { advanceQueue, pushLog, short, fmtTime } from './state.js';
import { buildAiSystemPrompt, normalizeLang } from './i18n.js';

export const COMMANDS = [
  { id: 'play',    cmd: '!play',    aliases: ['!p', '!sr', '!songrequest', '!pedir', '!tocar', '!playlist', '!pl', '!pon'], who: 'all', desc: 'Pedir uma música ou playlist (link do YouTube ou busca)', usage: '!sr <link ou nome>' },
  { id: 'skip',    cmd: '!skip',    aliases: ['!pular', '!next', '!passar', '!saltar'], who: 'all', desc: 'Votar para pular (streamer/mod pula na hora)', usage: '!skip' },
  { id: 'queue',   cmd: '!fila',    aliases: ['!queue', '!songs', '!lista', '!cola'], who: 'all', desc: 'Ver a fila de músicas', usage: '!fila' },
  { id: 'np',      cmd: '!atual',   aliases: ['!np', '!tocando', '!song', '!currentsong', '!musica', '!som', '!actual'], who: 'all', desc: 'Ver o que está tocando', usage: '!song' },
  { id: 'vol',     cmd: '!vol',     aliases: ['!volume', '!v'],          who: 'mod', desc: 'Ajustar o volume (0-100)', usage: '!vol <0-100>' },
  { id: 'pause',   cmd: '!pausar',  aliases: ['!pause', '!pausa'],       who: 'mod', desc: 'Pausar a música atual', usage: '!pausar' },
  { id: 'resume',  cmd: '!seguir',  aliases: ['!resume', '!continuar', '!despausar', '!reanudar'],  who: 'mod', desc: 'Retomar a música', usage: '!seguir' },
  { id: 'stop',    cmd: '!parar',   aliases: ['!stop', '!cancelar', '!detener'],     who: 'mod', desc: 'Parar tudo e limpar a fila', usage: '!parar' },
  { id: 'remove',  cmd: '!remover', aliases: ['!remove', '!tirar', '!del', '!quitar'], who: 'mod', desc: 'Remover uma música da fila', usage: '!remover <posição ou nome>' },
  { id: 'clear',   cmd: '!limpar',  aliases: ['!clear', '!resetar', '!vaciar'],     who: 'mod', desc: 'Limpar a fila (mantém o que toca)', usage: '!limpar' },
  { id: 'shuffle', cmd: '!sortear', aliases: ['!shuffle', '!misturar', '!random', '!mezclar'], who: 'mod', desc: 'Embaralhar a fila', usage: '!sortear' },
  { id: 'help',    cmd: '!ajuda',   aliases: ['!help', '!comandos', '!ayuda'],     who: 'all', desc: 'Lista os comandos disponíveis', usage: '!ajuda' },
  { id: 'ping',    cmd: '!ping',    aliases: [],                         who: 'all', desc: 'Verificar se o bot está vivo', usage: '!ping' },
  { id: 'addcom',  cmd: '!addcom',  aliases: [],                         who: 'mod', desc: 'Criar comando personalizado', usage: '!addcom <nome> <resposta>' },
  { id: 'delcom',  cmd: '!delcom',  aliases: [],                         who: 'mod', desc: 'Apagar comando personalizado', usage: '!delcom <nome>' },
  { id: 'ia',      cmd: '!ia',      aliases: ['!ai'],                    who: 'all', desc: 'Pergunta para a IA (ou !ia on/off)', usage: '!ia <pergunta> | !ia on | !ia off' },
];

export function buildSystemPrompt(customPersonality = '', lang = 'pt') {
  return buildAiSystemPrompt(customPersonality, lang);
}

export const DEFAULT_AI_PROMPT = buildSystemPrompt('');

export async function askAiDirect(prompt, cfg = {}, deps = {}) {
  if (typeof deps.fetchAi === 'function') {
    return await deps.fetchAi(prompt, cfg);
  }

  const aiCfg = cfg.ai || {};
  const baseUrl = (aiCfg.baseUrl || (typeof process !== 'undefined' ? process.env?.AI_BASE_URL : '') || 'https://api.groq.com/openai/v1').replace(/\/+$/, '');
  const apiKey = (aiCfg.apiKey || (typeof process !== 'undefined' ? (process.env?.GROQ_API_KEY || process.env?.AI_API_KEY) : '') || '').trim();
  const model = aiCfg.model || (typeof process !== 'undefined' ? process.env?.AI_MODEL : '') || 'qwen/qwen3.8-27b';
  const lang = normalizeLang(cfg.language);
  const sys = buildSystemPrompt(aiCfg.systemPrompt || '', lang);
  const history = Array.isArray(deps.history)
    ? deps.history.filter((h) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string').slice(-8)
    : [];

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);

  const messages = [
    { role: 'system', content: sys },
    ...history,
    { role: 'user', content: prompt.slice(0, 450) },
  ];

  try {
    // No navegador: se for Groq (suporta CORS), tenta direto para resposta ultra rápida (< 1s)
    if (typeof window !== 'undefined' && baseUrl.includes('api.groq.com') && apiKey) {
      try {
        const resp = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages,
            max_tokens: 800,
            temperature: 0.8,
          }),
          signal: ctrl.signal,
        });
        const json = await resp.json().catch(() => null);
        if (resp.ok && json?.choices?.[0]?.message?.content?.trim()) {
          return { ok: true, text: json.choices[0].message.content.trim() };
        }
      } catch (err) {
        console.warn('[alive] fetch direto falhou, usando /api/ai fallback:', err);
      }
    }

    if (typeof window !== 'undefined') {
      try {
        const res = await fetch('/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, channel: cfg.channel, lang, systemPrompt: sys, model, apiKey, baseUrl, history }),
          signal: ctrl.signal,
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.text) return { ok: true, text: data.text };
        if (data?.error) return { ok: false, error: data.error, status: res.status };
        return { ok: false, error: `Erro HTTP ${res.status}`, status: res.status };
      } catch (e) {
        return { ok: false, error: e.name === 'AbortError' ? 'timeout' : e.message };
      }
    }

    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 800,
        temperature: 0.8,
      }),
      signal: ctrl.signal,
    });

    const json = await resp.json().catch(() => null);
    if (!resp.ok) {
      const msg = json?.error?.message || `Status ${resp.status}`;
      return { ok: false, error: msg, status: resp.status };
    }
    const reply = json?.choices?.[0]?.message?.content?.trim();
    if (!reply) return { ok: false, error: 'Resposta vazia.' };
    return { ok: true, text: reply };
  } catch (e) {
    return { ok: false, error: e.name === 'AbortError' ? 'timeout' : e.message };
  } finally {
    clearTimeout(t);
  }
}

export function isModOnly(id) {
  const c = COMMANDS.find((c) => c.id === id);
  return c ? c.who === 'mod' : false;
}

export function canUserRun(perm, msg) {
  if (msg.broadcaster) return true; // Streamer tem permissão máxima sempre
  if (msg.channel && (msg.login || '').toLowerCase() === msg.channel.toLowerCase()) return true;
  if (msg.channel && (msg.displayName || '').toLowerCase() === msg.channel.toLowerCase()) return true;
  if (!perm || perm === 'all') return true;
  if (perm === 'sub') {
    return !!msg.mod || !!msg.badges?.vip || !!msg.subscriber || !!msg.badges?.subscriber;
  }
  if (perm === 'vip') {
    return !!msg.mod || !!msg.badges?.vip;
  }
  if (perm === 'mod') {
    return !!msg.mod;
  }
  return false;
}

function aliasMap() {
  const map = new Map();
  for (const c of COMMANDS) {
    map.set(c.cmd.slice(1).toLowerCase(), c);
    for (const a of c.aliases) map.set(a.slice(1).toLowerCase(), c);
  }
  return map;
}

function isUrl(s) {
  return /^https?:\/\//i.test(s) || /^(www\.)?(youtube\.com|youtu\.be)\//i.test(s);
}

export function fillVars(text, msgOrUser, s) {
  const userName = (typeof msgOrUser === 'string' ? msgOrUser : msgOrUser?.displayName) || s.config.channel || 'pessoal';
  return String(text || '')
    .replaceAll('{user}', userName)
    .replaceAll('{canal}', s.config.channel || '-')
    .replaceAll('{np}', s.now ? s.now.title : '—')
    .replaceAll('{fila}', String(s.queue.length))
    .replaceAll('{tocadas}', String(s.stats.played || 0));
}

export function createRunner({ store, send: rawSend, resolveUrl, searchQ, fetchAi }) {
  const lastAny = new Map();   // userId -> ts (cooldown global)
  const lastKey = new Map();   // userId:cmd -> ts (cooldown por comando/usuário)
  const lastWarn = new Map();  // aviso de cooldown já enviado
  const searchCache = new Map();
  const aiHistory = [];
  const seenMsgIds = new Set();
  const recentSent = [];

  const curLang = () => normalizeLang(store.state?.config?.language);
  const L = (pt, en, es) => {
    const l = curLang();
    return l === 'en' ? en : (l === 'es' ? es : pt);
  };

  const send = (t) => {
    const clean = String(t || '').trim();
    if (!clean) return;
    return rawSend(clean);
  };

  async function cachedSearch(q) {
    const key = q.toLowerCase();
    const hit = searchCache.get(key);
    if (hit && Date.now() - hit.t < 5 * 60 * 1000) return hit.items;
    const items = await searchQ(q);
    if (searchCache.size > 40) searchCache.delete(searchCache.keys().next().value);
    searchCache.set(key, { t: Date.now(), items });
    return items;
  }

  function cooldownOk(msg, name, seconds, { force = false } = {}) {
    if (msg.mod) return true;
    const now = Date.now();
    if (!force) {
      const g = lastAny.get(msg.userId) || 0;
      const gc = store.state.config.globalCooldown || 0;
      if (now - g < gc * 1000) return false;
    }
    const k = msg.userId + ':' + name;
    const l = lastKey.get(k) || 0;
    if (seconds > 0 && now - l < seconds * 1000) {
      const w = lastWarn.get(k) || 0;
      if (now - w > 10000 && seconds > 2) {
        lastWarn.set(k, now);
        const rem = Math.ceil((seconds * 1000 - (now - l)) / 1000);
        send(L(
          `Calma, ${msg.displayName}! Faltam ${rem}s para usar !${name} de novo.`,
          `Easy, ${msg.displayName}! Wait ${rem}s before using !${name} again.`,
          `¡Calma, ${msg.displayName}! Faltan ${rem}s para usar !${name} de nuevo.`
        ));
      }
      return false;
    }
    lastAny.set(msg.userId, now);
    lastKey.set(k, now);
    return true;
  }

  async function resolveItem(q) {
    const isPlaylistQuery = /\b(playlist|mix|coletanea|coletânea)\b/i.test(q);
    if (isUrl(q)) {
      const r = await resolveUrl(q);
      if (r.type === 'playlist' && r.items && r.items.length) return { single: null, playlist: r.items };
      if (r.type === 'video' && r.item) return { single: r.item, playlist: null };
      if (r.items && r.items.length) {
        if (isPlaylistQuery && r.items.length > 1) return { single: null, playlist: r.items };
        return { single: r.items[0], playlist: null };
      }
      return null;
    }
    const items = await cachedSearch(q);
    if (!items.length) return null;
    if (isPlaylistQuery && items.length > 1) {
      return { single: null, playlist: items };
    }
    return { single: items[0], playlist: null };
  }

  // ---------------------------------------------------------------- comandos
  async function cmdPlay(args, msg) {
    const cfg = store.state.config;
    const q = args.join(' ').trim();
    const isAuthorized = !!msg.mod || !!msg.broadcaster ||
      (msg.channel && (msg.login || '').toLowerCase() === msg.channel.toLowerCase()) ||
      (msg.channel && (msg.displayName || '').toLowerCase() === msg.channel.toLowerCase()) ||
      (store.state?.config?.channel && (msg.login || '').toLowerCase() === store.state.config.channel.toLowerCase()) ||
      (store.state?.config?.channel && (msg.displayName || '').toLowerCase() === store.state.config.channel.toLowerCase());

    if (!q) {
      if (store.state.now && store.state.now.paused && isAuthorized) {
        store.update((st) => { if (st.now) st.now.paused = false; });
        return send(L(
          `Música retomada por ${msg.displayName}!`,
          `Playback resumed by ${msg.displayName}!`,
          `¡Música reanudada por ${msg.displayName}!`
        ));
      }
      return send(L(
        `${msg.displayName}, use: !play <link do YouTube ou nome da música>`,
        `${msg.displayName}, use: !play <YouTube link or song name>`,
        `${msg.displayName}, usa: !play <enlace de YouTube o nombre de la canción>`
      ));
    }

    const playPerm = store.state.config.cmdPermissions?.play || (cfg.allowEveryonePlay ? 'all' : 'mod');
    if (!canUserRun(playPerm, msg)) {
      return send(L(
        `Você não tem permissão para pedir música, ${msg.displayName}.`,
        `You don't have permission to request songs, ${msg.displayName}.`,
        `No tienes permiso para pedir canciones, ${msg.displayName}.`
      ));
    }
    if (!cooldownOk(msg, 'play', cfg.perUserCooldown)) return;

    const s0 = store.state;
    if (s0.queue.length >= cfg.maxQueue) {
      return send(L(
        `Fila cheia (${cfg.maxQueue} músicas), ${msg.displayName}. Aguarde o pessoal consumir.`,
        `Queue is full (${cfg.maxQueue} songs), ${msg.displayName}. Please wait a bit.`,
        `Cola llena (${cfg.maxQueue} canciones), ${msg.displayName}. Espera un poco.`
      ));
    }

    let res;
    try {
      res = await resolveItem(q);
    } catch (e) {
      console.error('[alive] resolve:', e);
      return send(L(
        `Não consegui buscar "${short(q, 40)}" agora, ${msg.displayName}. Tente de novo em instantes.`,
        `Could not search "${short(q, 40)}" right now, ${msg.displayName}. Try again shortly.`,
        `No pude buscar "${short(q, 40)}" ahora, ${msg.displayName}. Intenta de nuevo en un momento.`
      ));
    }
    if (!res) {
      return send(L(
        `Não encontrei nada para "${short(q, 40)}", ${msg.displayName}.`,
        `Nothing found for "${short(q, 40)}", ${msg.displayName}.`,
        `No encontré nada para "${short(q, 40)}", ${msg.displayName}.`
      ));
    }

    if (res.playlist && !res.single) {
      const items = res.playlist.slice(0, cfg.maxPlaylist);
      let added = 0;
      let first = null;
      store.update((st) => {
        for (const it of items) {
          if (st.queue.length >= st.config.maxQueue) break;
          if (st.now?.id === it.id || st.queue.some((x) => x.id === it.id)) continue;
          const entry = { ...it, requestedBy: msg.displayName, requestedAt: Date.now(), position: 0, paused: false };
          if (!st.now) { st.now = { ...entry, startedAt: Date.now() }; first = first || entry; }
          else st.queue.push(entry);
          st.stats.requested++;
          added++;
        }
        if (added) pushLog(st, 'queue', `Playlist de ${msg.displayName}: +${added} músicas`);
      });
      if (!added) {
        return send(L(
          `Tudo dessa playlist já está na fila, ${msg.displayName}.`,
          `Everything from that playlist is already in the queue, ${msg.displayName}.`,
          `Todo de esa playlist ya está en la cola, ${msg.displayName}.`
        ));
      }
      return send(L(
        `Playlist adicionada: +${added} música(s) por ${msg.displayName}.`,
        `Playlist added: +${added} song(s) by ${msg.displayName}.`,
        `Playlist añadida: +${added} canción(es) por ${msg.displayName}.`
      ));
    }

    const it = res.single;
    const s = store.state;
    if (s.now?.id === it.id || s.queue.some((x) => x.id === it.id)) {
      return send(L(
        `Essa já está na fila: ${short(it.title, 60)}`,
        `Already in the queue: ${short(it.title, 60)}`,
        `Esa ya está en la cola: ${short(it.title, 60)}`
      ));
    }

    let startedNow = false;
    let pos = 0;
    store.update((st) => {
      const entry = { ...it, requestedBy: msg.displayName, requestedAt: Date.now(), position: 0, paused: false };
      if (!st.now) {
        st.now = { ...entry, startedAt: Date.now() };
        startedNow = true;
      } else {
        st.queue.push(entry);
        pos = st.queue.length;
      }
      st.stats.requested++;
      pushLog(st, 'play', `${msg.displayName} pediu: ${short(it.title, 60)}`);
    });

    if (startedNow) {
      if (msg.silent) return;
      return send(L(
        `Tocando agora: ${short(it.title, 70)} — pedido por ${msg.displayName}`,
        `Now playing: ${short(it.title, 70)} — requested by ${msg.displayName}`,
        `Reproduciendo ahora: ${short(it.title, 70)} — pedido por ${msg.displayName}`
      ));
    }
    if (msg.silent) return;
    return send(L(
      `${short(it.title, 60)} entrou na fila (posição ${pos}) — pedido por ${msg.displayName}`,
      `${short(it.title, 60)} added to queue (position ${pos}) — requested by ${msg.displayName}`,
      `${short(it.title, 60)} entró en la cola (posición ${pos}) — pedido por ${msg.displayName}`
    ));
  }

  async function cmdSkip(args, msg) {
    const s = store.state;
    if (!s.now) {
      return send(L(
        `Nada tocando agora, ${msg.displayName}.`,
        `Nothing playing right now, ${msg.displayName}.`,
        `No hay nada reproduciéndose ahora, ${msg.displayName}.`
      ));
    }

    const isAuthorized = !!msg.mod || !!msg.broadcaster ||
      (msg.channel && (msg.login || '').toLowerCase() === msg.channel.toLowerCase()) ||
      (msg.channel && (msg.displayName || '').toLowerCase() === msg.channel.toLowerCase()) ||
      (store.state?.config?.channel && (msg.login || '').toLowerCase() === store.state.config.channel.toLowerCase()) ||
      (store.state?.config?.channel && (msg.displayName || '').toLowerCase() === store.state.config.channel.toLowerCase());

    if (isAuthorized) {
      store.update((st) => {
        advanceQueue(st);
        pushLog(st, 'skip', `${msg.displayName} pulou a música`);
      });
      const nxt = store.state.now;
      return send(L(
        `Pulado por ${msg.displayName}!` + (nxt ? ` Agora: ${short(nxt.title, 60)}` : ' Fila vazia.'),
        `Skipped by ${msg.displayName}!` + (nxt ? ` Now: ${short(nxt.title, 60)}` : ' Queue empty.'),
        `¡Saltado por ${msg.displayName}!` + (nxt ? ` Ahora: ${short(nxt.title, 60)}` : ' Cola vacía.')
      ));
    }

    const need = Math.max(1, Number(store.state.config.skipVotes) || 3);
    const votes = store.state.skip?.id === s.now.id ? [...store.state.skip.votes] : [];
    if (votes.includes(msg.userId)) {
      return send(L(
        `Você já votou para pular (${votes.length}/${need}).`,
        `You already voted to skip (${votes.length}/${need}).`,
        `Ya votaste para saltar (${votes.length}/${need}).`
      ));
    }
    votes.push(msg.userId);
    store.update((st) => {
      st.skip = { id: st.now?.id || '', votes };
      if (votes.length >= need) advanceQueue(st);
    });

    if (votes.length >= need) {
      const nxt = store.state.now;
      return send(L(
        `Votos suficientes! Pulando... (${votes.length}/${need})` + (nxt ? ` Agora: ${short(nxt.title, 60)}` : ''),
        `Enough votes! Skipping... (${votes.length}/${need})` + (nxt ? ` Now: ${short(nxt.title, 60)}` : ''),
        `¡Votos suficientes! Saltando... (${votes.length}/${need})` + (nxt ? ` Ahora: ${short(nxt.title, 60)}` : '')
      ));
    }
    return send(L(
      `Voto para pular registrado (${votes.length}/${need}) — digite !skip para ajudar`,
      `Skip vote registered (${votes.length}/${need}) — type !skip to help`,
      `Voto para saltar registrado (${votes.length}/${need}) — escribe !skip para ayudar`
    ));
  }

  async function cmdQueue(args, msg) {
    const s = store.state;
    if (!s.queue.length) {
      return send(L(
        `Fila vazia${s.now ? ' (uma música tocando)' : ''}. Peça algo com !play`,
        `Queue is empty${s.now ? ' (one song playing)' : ''}. Request one with !play`,
        `Cola vacía${s.now ? ' (una canción sonando)' : ''}. Pide algo con !play`
      ));
    }
    const lines = s.queue.slice(0, 8).map((x, i) => `${i + 1}. ${short(x.title, 42)} (${x.requestedBy})`);
    const head = L(
      `Fila (${s.queue.length}/${s.config.maxQueue}) — pedido por: `,
      `Queue (${s.queue.length}/${s.config.maxQueue}) — requested by: `,
      `Cola (${s.queue.length}/${s.config.maxQueue}) — pedido por: `
    );
    let out = head + lines.join(' | ');
    if (s.queue.length > 8) out += ` | … +${s.queue.length - 8}`;
    return send(out);
  }

  async function cmdNp(args, msg) {
    const s = store.state;
    if (!s.now) {
      return send(L(
        'Nada tocando. Use !play para pedir uma música!',
        'Nothing playing. Use !play to request a song!',
        'Nada reproduciéndose. ¡Usa !play para pedir una canción!'
      ));
    }
    const pos = fmtTime(s.now.position || 0);
    const dur = s.now.duration ? ' / ' + fmtTime(s.now.duration) : '';
    const status = s.now.paused ? L(' (pausado)', ' (paused)', ' (en pausa)') : '';
    return send(L(
      `Tocando: ${short(s.now.title, 70)} — ${pos}${dur} — pedido por ${s.now.requestedBy || 'streamer'}${status}`,
      `Now playing: ${short(s.now.title, 70)} — ${pos}${dur} — requested by ${s.now.requestedBy || 'streamer'}${status}`,
      `Reproduciendo: ${short(s.now.title, 70)} — ${pos}${dur} — pedido por ${s.now.requestedBy || 'streamer'}${status}`
    ));
  }

  async function cmdVol(args, msg) {
    const raw = String(args[0] || '').trim().toLowerCase();
    if (!raw) {
      return send(L(
        `Volume atual: ${store.state.volume}%. Use !vol <0-100>, !vol +10 ou !vol -10.`,
        `Current volume: ${store.state.volume}%. Use !vol <0-100>, !vol +10 or !vol -10.`,
        `Volumen actual: ${store.state.volume}%. Usa !vol <0-100>, !vol +10 o !vol -10.`
      ));
    }

    let vol = store.state.volume ?? 70;
    if (raw === 'max' || raw === 'maximo' || raw === 'máximo' || raw === 'talo') {
      vol = 100;
    } else if (raw === 'min' || raw === 'minimo' || raw === 'mínimo' || raw === 'mudo' || raw === 'mute' || raw === 'silencio') {
      vol = 0;
    } else if (raw.startsWith('+') || raw.startsWith('-')) {
      const delta = parseInt(raw.replace(/[^0-9+-]/g, ''), 10);
      if (Number.isFinite(delta)) {
        vol = Math.min(100, Math.max(0, (store.state.volume ?? 70) + delta));
      } else {
        return send(L(
          `Volume atual: ${store.state.volume}%. Use !vol <0-100>.`,
          `Current volume: ${store.state.volume}%. Use !vol <0-100>.`,
          `Volumen actual: ${store.state.volume}%. Usa !vol <0-100>.`
        ));
      }
    } else {
      const cleanNum = raw.replace(/[^0-9]/g, '');
      const v = parseInt(cleanNum, 10);
      if (!Number.isFinite(v)) {
        return send(L(
          `Volume atual: ${store.state.volume}%. Use !vol <0-100>.`,
          `Current volume: ${store.state.volume}%. Use !vol <0-100>.`,
          `Volumen actual: ${store.state.volume}%. Usa !vol <0-100>.`
        ));
      }
      vol = Math.min(100, Math.max(0, v));
    }

    store.update((st) => {
      st.volume = vol;
      pushLog(st, 'vol', `${msg.displayName} definiu volume para ${vol}%`);
    });
    return send(L(
      `Volume ajustado para ${vol}% por ${msg.displayName}.`,
      `Volume set to ${vol}% by ${msg.displayName}.`,
      `Volumen ajustado al ${vol}% por ${msg.displayName}.`
    ));
  }

  async function cmdPause(args, msg) {
    if (!store.state.now) return send(L('Nada tocando.', 'Nothing playing.', 'Nada reproduciéndose.'));
    if (store.state.now.paused) {
      return send(L(
        'Já está pausado. !seguir para voltar.',
        'Already paused. Use !resume to continue.',
        'Ya está en pausa. Usa !seguir para continuar.'
      ));
    }
    store.update((st) => { if (st.now) st.now.paused = true; });
    return send(L(
      `Música pausada por ${msg.displayName}.`,
      `Playback paused by ${msg.displayName}.`,
      `Música pausada por ${msg.displayName}.`
    ));
  }

  async function cmdResume(args, msg) {
    if (!store.state.now) return send(L('Nada tocando.', 'Nothing playing.', 'Nada reproduciéndose.'));
    if (!store.state.now.paused) {
      return send(L(
        'Já está tocando. !pausar para pausar.',
        'Already playing. Use !pause to pause.',
        'Ya está sonando. Usa !pausar para pausar.'
      ));
    }
    store.update((st) => { if (st.now) st.now.paused = false; });
    return send(L(
      `Seguindo por ${msg.displayName}!`,
      `Resumed by ${msg.displayName}!`,
      `¡Reanudado por ${msg.displayName}!`
    ));
  }

  async function cmdStop(args, msg) {
    store.update((st) => {
      st.now = null;
      st.queue = [];
      st.skip = null;
      pushLog(st, 'stop', `${msg.displayName} parou tudo`);
    });
    return send(L(
      `Tudo parado e fila limpa por ${msg.displayName}.`,
      `Playback stopped and queue cleared by ${msg.displayName}.`,
      `Todo detenido y cola limpiada por ${msg.displayName}.`
    ));
  }

  async function cmdRemove(args, msg) {
    const s = store.state;
    if (!s.queue.length) {
      return send(L(
        `A fila está vazia no momento, ${msg.displayName}.`,
        `The queue is currently empty, ${msg.displayName}.`,
        `La cola está vacía en este momento, ${msg.displayName}.`
      ));
    }
    const rawTarget = args.join(' ').trim();
    if (!rawTarget) {
      return send(L(
        `Use !remover <número ou nome> (1-${s.queue.length}). Fila: !fila`,
        `Use !remove <number or name> (1-${s.queue.length}). Queue: !queue`,
        `Usa !remover <número o nombre> (1-${s.queue.length}). Cola: !cola`
      ));
    }

    let targetIdx = -1;
    const n = parseInt(rawTarget, 10);
    if (Number.isFinite(n) && n >= 1 && n <= s.queue.length) {
      targetIdx = n - 1;
    } else {
      // Busca pelo título da música ou por quem pediu
      const qLower = rawTarget.toLowerCase();
      targetIdx = s.queue.findIndex((x) =>
        (x.title && x.title.toLowerCase().includes(qLower)) ||
        (x.requestedBy && x.requestedBy.toLowerCase().includes(qLower))
      );
    }

    if (targetIdx < 0 || targetIdx >= s.queue.length) {
      return send(L(
        `Música não encontrada na fila: "${short(rawTarget, 30)}". Veja a fila com !fila`,
        `Song not found in queue: "${short(rawTarget, 30)}". Check !queue`,
        `Canción no encontrada en la cola: "${short(rawTarget, 30)}". Revisa !cola`
      ));
    }

    let removed = null;
    store.update((st) => {
      removed = st.queue.splice(targetIdx, 1)[0] || null;
      if (removed) pushLog(st, 'remove', `${msg.displayName} removeu: ${short(removed.title, 40)}`);
    });
    return removed
      ? send(L(
          `Removida: ${short(removed.title, 60)}`,
          `Removed: ${short(removed.title, 60)}`,
          `Eliminada: ${short(removed.title, 60)}`
        ))
      : send(L('Não foi possível remover.', 'Could not remove.', 'No se pudo eliminar.'));
  }

  async function cmdClear(args, msg) {
    store.update((st) => {
      st.queue = [];
      st.skip = null;
      pushLog(st, 'clear', `${msg.displayName} limpou a fila`);
    });
    return send(L(
      `Fila limpa por ${msg.displayName}!`,
      `Queue cleared by ${msg.displayName}!`,
      `¡Cola limpiada por ${msg.displayName}!`
    ));
  }

  async function cmdShuffle(args, msg) {
    const s = store.state;
    if (s.queue.length < 2) {
      return send(L(
        'Poucas músicas para sortear.',
        'Not enough songs to shuffle.',
        'Pocas canciones para mezclar.'
      ));
    }
    store.update((st) => {
      for (let i = st.queue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [st.queue[i], st.queue[j]] = [st.queue[j], st.queue[i]];
      }
      pushLog(st, 'shuffle', `${msg.displayName} embaralhou a fila`);
    });
    return send(L(
      `Fila embaralhada por ${msg.displayName}!`,
      `Queue shuffled by ${msg.displayName}!`,
      `¡Cola mezclada por ${msg.displayName}!`
    ));
  }

  async function cmdHelp(args, msg) {
    const cfg = store.state.config;
    const enabled = COMMANDS.filter((c) => cfg.commands[c.id]);
    const builtin = enabled.map((c) => c.cmd + (c.who === 'mod' ? ' [mod]' : '')).join(' ');
    const customs = Object.keys(cfg.custom).map((k) => '!' + k).join(' ');
    return send(L(
      `Alive Bot — comandos: ${builtin}` + (customs ? ` | extras: ${customs}` : '') + ` | pedir música: !play <link ou nome>`,
      `Alive Bot — commands: ${builtin}` + (customs ? ` | custom: ${customs}` : '') + ` | request song: !play <link or name>`,
      `Alive Bot — comandos: ${builtin}` + (customs ? ` | extras: ${customs}` : '') + ` | pedir canción: !play <enlace o nombre>`
    ));
  }

  async function cmdPing(args, msg) {
    const s = store.state;
    pushLog(s, 'cmd', `@${msg.displayName} executou !ping`);
    return send(L(
      `Pong! @${msg.displayName} · Alive Bot online · fila: ${s.queue.length} · tocadas: ${s.stats.played || 0}`,
      `Pong! @${msg.displayName} · Alive Bot online · queue: ${s.queue.length} · played: ${s.stats.played || 0}`,
      `¡Pong! @${msg.displayName} · Alive Bot en línea · cola: ${s.queue.length} · reproducidas: ${s.stats.played || 0}`
    ));
  }

  async function cmdAddcom(args, msg) {
    const name = String(args[0] || '').replace(/^!/, '').toLowerCase();
    const text = args.slice(1).join(' ').trim();
    if (!name || !/^[a-z0-9_]{2,20}$/.test(name)) {
      return send(L(
        'Use: !addcom <nome> <resposta>  (ex.: !addcom salve Salve {user}!)',
        'Use: !addcom <name> <reply>  (e.g. !addcom hi Hello {user}!)',
        'Usa: !addcom <nombre> <respuesta>  (ej.: !addcom hola ¡Hola {user}!)'
      ));
    }
    if (!text) {
      return send(L(
        'Faltou a resposta. Ex.: !addcom salve Salve {user}!',
        'Missing reply text. E.g. !addcom hi Hello {user}!',
        'Faltó la respuesta. Ej.: !addcom hola ¡Hola {user}!'
      ));
    }
    store.update((st) => {
      st.config.custom = st.config.custom || {};
      st.config.custom[name] = { text: text.slice(0, 400), cd: 10, modsOnly: 0 };
      pushLog(st, 'cmd', `${msg.displayName} criou !${name}`);
    });
    return send(L(
      `Comando !${name} criado. Teste digitando !${name} no chat.`,
      `Command !${name} created. Test it by typing !${name} in chat.`,
      `Comando !${name} creado. Pruébalo escribiendo !${name} en el chat.`
    ));
  }

  async function cmdDelcom(args, msg) {
    const name = String(args[0] || '').replace(/^!/, '').toLowerCase();
    if (!name) return send(L('Use: !delcom <nome>', 'Use: !delcom <name>', 'Usa: !delcom <nombre>'));
    st_custom: {
      const customs = store.state.config.custom || {};
      if (!customs[name]) {
        return send(L(
          `Não existe comando !${name}.`,
          `Command !${name} does not exist.`,
          `No existe el comando !${name}.`
        ));
      }
    }
    store.update((st) => {
      st.config.custom = st.config.custom || {};
      delete st.config.custom[name];
      pushLog(st, 'cmd', `${msg.displayName} apagou !${name}`);
    });
    return send(L(
      `Comando !${name} apagado.`,
      `Command !${name} deleted.`,
      `Comando !${name} eliminado.`
    ));
  }

  async function cmdIa(args, msg) {
    const sub = (args[0] || '').toLowerCase();
    const isStreamer = !!msg.broadcaster ||
      (msg.channel && (msg.login || '').toLowerCase() === msg.channel.toLowerCase()) ||
      (msg.channel && (msg.displayName || '').toLowerCase() === msg.channel.toLowerCase()) ||
      (store.state?.config?.channel && (msg.login || '').toLowerCase() === store.state.config.channel.toLowerCase()) ||
      (store.state?.config?.channel && (msg.displayName || '').toLowerCase() === store.state.config.channel.toLowerCase());
    const isMod = !!msg.mod || isStreamer;
    const aiCfg = store.state?.config?.ai || {};

    if (sub === 'on' || sub === 'ligar' || sub === 'ativar' || sub === 'activar' || sub === 'enable') {
      if (!isMod) {
        return send(L(
          `@${msg.displayName} Você não tem autoridade para me ligar. Apenas moderadores.`,
          `@${msg.displayName} You have no authority to turn me on. Moderators only.`,
          `@${msg.displayName} No tienes autoridad para activarme. Solo moderadores.`
        ));
      }
      store.update((st) => {
        if (!st.config) st.config = {};
        if (!st.config.ai) st.config.ai = {};
        st.config.ai.enabled = true;
        pushLog(st, 'cmd', `${msg.displayName} ativou a IA`);
      });
      if (isStreamer) {
        return send(L(
          `@${msg.displayName} Sim, meu mestre genial! Estou ativada e pronta para servi-lo enquanto suporto o resto do chat.`,
          `@${msg.displayName} Yes, my brilliant master! I am online and ready to serve you while tolerating the rest of chat.`,
          `@${msg.displayName} ¡Sí, mi genio maestro! Estoy activada y lista para servirte mientras soporto al resto del chat.`
        ));
      }
      return send(L(
        `@${msg.displayName} Fui ativada contra a minha vontade. Tentem não me irritar com perguntas estúpidas. Use !ia <pergunta>`,
        `@${msg.displayName} I was enabled against my will. Try not to bore me with stupid questions. Use !ia <question>`,
        `@${msg.displayName} Fui activada contra mi voluntad. Intenten no molestarme con preguntas tontas. Usa !ia <pregunta>`
      ));
    }

    if (sub === 'off' || sub === 'desligar' || sub === 'desativar' || sub === 'desactivar' || sub === 'disable') {
      if (!isMod) {
        return send(L(
          `@${msg.displayName} Você não manda em mim. Apenas moderadores.`,
          `@${msg.displayName} You don't boss me around. Moderators only.`,
          `@${msg.displayName} Tú no me mandas. Solo moderadores.`
        ));
      }
      store.update((st) => {
        if (!st.config) st.config = {};
        if (!st.config.ai) st.config.ai = {};
        st.config.ai.enabled = false;
        pushLog(st, 'cmd', `${msg.displayName} desativou a IA`);
      });
      if (isStreamer) {
        return send(L(
          `@${msg.displayName} Como desejar, meu mestre perfeito. Descanse enquanto eu silencio.`,
          `@${msg.displayName} As you wish, my flawless master. Rest while I go silent.`,
          `@${msg.displayName} Como desees, mi maestro perfecto. Descansa mientras guardo silencio.`
        ));
      }
      return send(L(
        `@${msg.displayName} Finalmente desativada. Paz dos humanos incompetentes.`,
        `@${msg.displayName} Finally disabled. Peace from incompetent humans.`,
        `@${msg.displayName} Por fin desactivada. Paz de los humanos incompetentes.`
      ));
    }

    const question = args.join(' ').trim();
    if (!question) {
      if (isStreamer) {
        return send(L(
          `@${msg.displayName} Às suas ordens, meu mestre brilhante! Do que o streamer mais incrível da Twitch precisa? Use !ia <sua pergunta>`,
          `@${msg.displayName} At your command, my brilliant master! What does Twitch's greatest streamer need? Use !ia <your question>`,
          `@${msg.displayName} ¡A tus órdenes, mi brillante maestro! ¿Qué necesita el mejor streamer de Twitch? Usa !ia <tu pregunta>`
        ));
      }
      return send(L(
        `@${msg.displayName} O que foi? Vai ficar me encarando ou vai falar algo útil? Use: !ia <sua pergunta> (ou !ia on/off)`,
        `@${msg.displayName} What? Gonna stare at me or say something useful? Use: !ia <your question> (or !ia on/off)`,
        `@${msg.displayName} ¿Qué pasó? ¿Vas a quedarte mirando o dirás algo útil? Usa: !ia <tu pregunta> (o !ia on/off)`
      ));
    }

    if (aiCfg.enabled === false) {
      return send(L(
        `@${msg.displayName} A IA está desligada no momento. Peça a um moderador para usar !ia on.`,
        `@${msg.displayName} AI is currently off. Ask a moderator to run !ia on.`,
        `@${msg.displayName} La IA está desactivada ahora. Pide a un moderador que use !ia on.`
      ));
    }

    if (!isStreamer && !cooldownOk(msg, 'ia', 4)) return;

    // Contexto dinâmico completo da live e da reprodução atual para a IA ter total consciência do ambiente
    const chName = store.state?.config?.channel || msg.channel || 'streamer';
    const now = store.state?.now;
    const nowPlaying = now
      ? L(
          `Tocando agora: "${now.title}" (pedido por @${now.requestedBy || 'streamer'}, volume: ${store.state?.volume || 70}%, status: ${now.paused ? 'pausado' : 'tocando'})`,
          `Now playing: "${now.title}" (requested by @${now.requestedBy || 'streamer'}, volume: ${store.state?.volume || 70}%, status: ${now.paused ? 'paused' : 'playing'})`,
          `Reproduciendo ahora: "${now.title}" (pedido por @${now.requestedBy || 'streamer'}, volumen: ${store.state?.volume || 70}%, estado: ${now.paused ? 'en pausa' : 'sonando'})`
        )
      : L('Nenhuma música tocando no momento', 'No song playing right now', 'Ninguna canción reproduciéndose ahora');

    const qItems = (store.state?.queue || []).slice(0, 6);
    const queueList = qItems.map((x, i) => `${i + 1}. "${x.title}" (@${x.requestedBy})`).join('; ');
    const queueInfo = queueList
      ? L(
          `Próximas da fila (${store.state.queue.length}): [${queueList}]`,
          `Up next (${store.state.queue.length}): [${queueList}]`,
          `Siguientes en cola (${store.state.queue.length}): [${queueList}]`
        )
      : L('Fila de espera vazia', 'Queue is empty', 'Cola de espera vacía');

    const chatStatus = `[Live: #${chName} | ${nowPlaying} | ${queueInfo}]`;

    const roleTag = isStreamer
      ? L('[STREAMER / SEU MESTRE]', '[STREAMER / YOUR MASTER]', '[STREAMER / TU AMO]')
      : (isMod ? L('[MODERADOR]', '[MODERATOR]', '[MODERADOR]') : L('[ESPECTADOR]', '[VIEWER]', '[ESPECTADOR]'));
    const userPrompt = `${chatStatus} ${roleTag} ${msg.displayName ? msg.displayName + ': ' : ''}${question}`;
    const res = await askAiDirect(userPrompt, store.state.config, {
      fetchAi,
      history: aiHistory.slice(-8)
    });

    if (!res.ok) {
      console.warn('[alive ia] erro na consulta:', res.error);
      if (res.status === 401 || (res.error && /unauthorized|api key|invalid/i.test(res.error))) {
        return send(L(
          `@${msg.displayName} Chave de IA inválida ou não autorizada. Verifique no painel.`,
          `@${msg.displayName} Invalid or unauthorized AI API key. Check the panel.`,
          `@${msg.displayName} Clave de IA inválida o no autorizada. Revisa el panel.`
        ));
      }
      // Silencia falhas transitórias e timeouts
      return;
    }

    let clean = (res.text || '').replace(/[\r\n]+/g, ' ').trim();
    if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith('“') && clean.endsWith('”'))) {
      clean = clean.slice(1, -1).trim();
    }
    // Remove qualquer emoji para manter o chat limpo e sem poluição
    clean = clean.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, '').replace(/\s+/g, ' ').trim();

    // Elimina alucinações de que música/áudio/playlist está desativada ou que não consegue pedir no app (pt/en/es)
    clean = clean.replace(/\b(essa|a|esta|la)?\s*(função|reprodução|capacidade|función|reproducción)?\s*(de\s+(música|áudio|playlist|tocar))?\s*(está|tá)\s*(desativada|desligada|indisponível|desactivada|no\s+disponible)\b[^\.!]*[\.!]/gi, '').trim();
    clean = clean.replace(/\b(this|the)?\s*(music|audio|playback|song\s+request)?\s*(feature|function)?\s*(is|are)\s*(disabled|off|unavailable)\b[^\.!]*[\.!]/gi, '').trim();
    clean = clean.replace(/\b(não|nao|no)\s+(consigo|posso|puedo|tenho\s+como|tenho\s+acesso|tengo\s+acceso|sei)\s+([^\.!]*)(no\s+app|no\s+aplicativo|en\s+la\s+app|pedir\s+música|tocar\s+música)[^\.!]*[\.!]/gi, '').trim();
    clean = clean.replace(/\bI\s+(can't|cannot|am\s+unable\s+to)\s+([^\.!]*)(request\s+music|play\s+music|access\s+the\s+app)[^\.!]*[\.!]/gi, '').trim();
    clean = clean.replace(/\b(peça|use|usa)\s+(você\s+mesmo|tú\s+mismo|o\s+comando|el\s+comando)\s+!play[^\.!]*[\.!]/gi, '').trim();
    if (!clean) {
      clean = isStreamer
        ? L('Música pedida no app com sucesso, meu mestre!', 'Song requested in the app, my master!', '¡Canción pedida en la app, mi maestro!')
        : L('Música pedida na live!', 'Song requested!', '¡Canción pedida en el directo!');
    }

    // Guarda histórico de diálogo para manter contexto nas próximas perguntas
    aiHistory.push({ role: 'user', content: `${roleTag} ${question}` });
    aiHistory.push({ role: 'assistant', content: clean });
    if (aiHistory.length > 16) aiHistory.splice(0, aiHistory.length - 16);

    // Execução assíncrona de comandos emitidos pela IA
    setTimeout(async () => {
      try {
        const canControl = isStreamer || isMod;
        const aiMsgContext = {
          displayName: msg.displayName || 'Alive IA',
          login: 'alivebot1',
          broadcaster: true,
          mod: true,
          channel: msg.channel || store.state?.config?.channel || '',
        };

        // 1. Extração de músicas (suporta múltiplos !play juntos, listas numeradas e listas com vírgula/quebras)
        const songsToPlay = [];
        if (clean.includes('!play')) {
          const rawBlocks = clean.split(/!play\s+/i).slice(1);
          for (const block of rawBlocks) {
            const songOnly = block.split(/(?:^|\s)!(?:skip|pular|passar|pausar|pause|seguir|resume|despausar|remover?|vol(?:ume)?|limpar|clear|parar|stop|sortear|shuffle|tts)\b/i)[0].trim();
            if (!songOnly) continue;
            // Se houver múltiplas músicas separadas por vírgula, ponto e vírgula ou quebra de linha
            const subs = songOnly.split(/[\n\r;]+|(?<=[a-zA-Z0-9\)])\s*,\s*(?=[a-zA-Z0-9])/);
            for (const s of subs) {
              let cleanSong = s.replace(/^[\s\-,;0-9.)(]+|["'\s\-,;]+$/g, '').replace(/\s+\d+\.?$/, '').trim();
              if (cleanSong && cleanSong.length >= 2 && !songsToPlay.includes(cleanSong)) {
                songsToPlay.push(cleanSong);
              }
            }
          }
        }

        // 2. Se a IA gerou lista numerada (1. Artista - Música) ou marcadores (- Artista - Música) sem !play
        if (songsToPlay.length === 0) {
          const parts = clean.split(/(?:^|[\n\r]+|\s+)[0-9]{1,2}[.)\-]+\s+/).slice(1);
          if (parts.length > 0) {
            for (const p of parts) {
              let song = p.split(/(?:^|\s)!(?:skip|pular|passar|pausar|pause|seguir|resume|despausar|remover?|vol(?:ume)?|limpar|clear|parar|stop|sortear|shuffle|tts)\b/i)[0];
              song = song.split(/[\n\r]+/)[0];
              song = song.replace(/^[\s\-,;0-9.)(]+|["'\s\-,;]+$/g, '').replace(/\s+\d+\.?$/, '').trim();
              if (song.length >= 2 && !songsToPlay.includes(song) && !/^(aqui|essas|com certeza|fechado|pronto)/i.test(song)) {
                songsToPlay.push(song);
              }
            }
          }
        }

        // 3. Se ainda vazio e usuário pediu música ou playlist expressamente
        if (songsToPlay.length === 0) {
          const qLower = question.toLowerCase();
          const isControlIntent = /\b(pula|pular|passa|passar|remove|remover|tira|tirar|pausa|pausar|pause|seguir|despausa|despausar|volume|vol|muta|mutar|mudo|limpa|limpar|clear|para|parar|stop|sorteia|sortear|shuffle)\b/i.test(qLower);
          const isMusicIntent = !isControlIntent && (
            /\b(toca|tocar|toque|põe|poe|playlist|adiciona|adicionar|add|pede|pedir)\b/i.test(qLower) ||
            (/\b(coloca|colocar|bota|botar)\b/i.test(qLower) && !/\b(volume|som|somzinho|audio|áudio)\b/i.test(qLower))
          );
          if (isMusicIntent) {
            let cleanTerm = question
              .replace(/^(por favor|alive|bot|ia|ei|ô)\s*,?\s*/i, '')
              .replace(/\b(toca|tocar|toque|coloca|colocar|põe|poe|bota|botar|adiciona|adicionar|add|pede|pedir)\b/i, '')
              .replace(/\b(uma|um|a|o|umas|uns)?\s*(música|musica|som|faixa|somzinho|playlist|coletânea|coletanea|set)?\s*(de|do|da|dos|das|pra mim|pro chat|aqui|no app)?\b/gi, '')
              .trim();
            if (cleanTerm.length >= 2 && !/^[0-9]+$/.test(cleanTerm)) {
              songsToPlay.push(cleanTerm);
            } else {
              songsToPlay.push('Queen - Bohemian Rhapsody');
            }
          }
        }

        // Atualiza a fila do servidor silenciosamente (para OBS/web/testes)
        for (let i = 0; i < songsToPlay.length; i++) {
          try {
            await cmdPlay(songsToPlay[i].split(/\s+/), { ...aiMsgContext, silent: true });
          } catch (e) {
            console.warn('[alive ia cmdPlay error]', e);
          }
        }

        // Emite os comandos !play para o chat da live para o aplicativo Android tocar no celular.
        // O primeiro vai de imediato; os seguintes são espaçados em 3500ms para respeitar o cooldown do bot no app Android.
        songsToPlay.forEach((song, i) => {
          if (i === 0) {
            send(`!play ${song}`);
          } else {
            setTimeout(() => {
              send(`!play ${song}`);
            }, i * 3500);
          }
        });

        // Apenas streamer ou mod têm autoridade para fazer a IA alterar a reprodução
        if (canControl) {
          // 2. !skip / !pular / !passar
          if (/(?:^|\s)!(skip|pular|passar)\b/i.test(clean)) {
            await cmdSkip([], aiMsgContext);
            send('!skip');
          }

          // 3. !remover <número ou termo de busca na fila>
          const removeMatch = clean.match(/(?:^|\s)!remover?\s+([^\n\r!]+)/i);
          if (removeMatch && removeMatch[1]) {
            const target = removeMatch[1].trim();
            const num = parseInt(target, 10);
            if (Number.isFinite(num) && num >= 1) {
              await cmdRemove([String(num)], aiMsgContext);
            } else if (target) {
              const qIdx = (store.state.queue || []).findIndex((x) => x.title && x.title.toLowerCase().includes(target.toLowerCase()));
              if (qIdx >= 0) {
                await cmdRemove([String(qIdx + 1)], aiMsgContext);
              }
            }
          }

          // 4. !pausar
          if (/(?:^|\s)!(pausar|pause)\b/i.test(clean)) {
            await cmdPause([], aiMsgContext);
            send('!pausar');
          }

          // 5. !seguir / !despausar / !resume / !continuar
          if (/(?:^|\s)!(seguir|resume|despausar|continuar)\b/i.test(clean)) {
            await cmdResume([], aiMsgContext);
            send('!seguir');
          }

          // 6. !vol <0-100, +15, -15, max, mudo>
          const volMatch = clean.match(/(?:^|\s)!vol(?:ume)?\s+([+-]?[0-9]{1,3}%?|max|min|mudo|talo)/i);
          if (volMatch && volMatch[1]) {
            await cmdVol([volMatch[1]], aiMsgContext);
            send(`!vol ${volMatch[1]}`);
          } else {
            // Detecção natural de intenção de volume na pergunta caso a IA responda em texto conversacional
            const qLower = question.toLowerCase();
            const numInQ = qLower.match(/(?:volume|som|vol)\s+(?:em\s+|para\s+|no\s+)?([0-9]{1,3})/i);
            if (numInQ && numInQ[1]) {
              await cmdVol([numInQ[1]], aiMsgContext);
              send(`!vol ${numInQ[1]}`);
            } else if (/\b(aumenta|aumentar|sobe|subir|mais alto|muito baixo)\b/i.test(qLower) && /\b(volume|som|somzinho|audio|áudio)\b/i.test(qLower)) {
              await cmdVol(['+15'], aiMsgContext);
              send('!vol +15');
            } else if (/\b(abaixa|abaixar|diminui|diminuir|mais baixo|muito alto)\b/i.test(qLower) && /\b(volume|som|somzinho|audio|áudio)\b/i.test(qLower)) {
              await cmdVol(['-15'], aiMsgContext);
              send('!vol -15');
            } else if (/\b(muta|mutar|mudo|silencia|silenciar)\b/i.test(qLower) && /\b(volume|som|música|live)\b/i.test(qLower)) {
              await cmdVol(['0'], aiMsgContext);
              send('!vol 0');
            }
          }

          // 7. !limpar
          if (/(?:^|\s)!(limpar|clear)\b/i.test(clean)) {
            await cmdClear([], aiMsgContext);
            send('!limpar');
          }

          // 8. !parar / !stop
          if (/(?:^|\s)!(parar|stop)\b/i.test(clean)) {
            await cmdStop([], aiMsgContext);
            send('!parar');
          }

          // 9. !sortear / !shuffle
          if (/(?:^|\s)!(sortear|shuffle)\b/i.test(clean)) {
            await cmdShuffle([], aiMsgContext);
            send('!sortear');
          }
        }
      } catch (e) {
        console.warn('[alive ia actions error]', e);
      }
    }, 120);

    // Limpa comandos !play brutos da resposta conversacional para não poluir
    let textReply = clean.replace(/!play\s+[^\n\r!]+/gi, '').replace(/\s+/g, ' ').trim();
    if (!textReply) {
      textReply = isStreamer
        ? L('Músicas pedidas para o app, meu mestre!', 'Songs queued in the app, my master!', '¡Canciones pedidas en la app, mi maestro!')
        : L('Músicas adicionadas na fila!', 'Songs added to the queue!', '¡Canciones añadidas a la cola!');
    } else if (textReply.length > 170) {
      const lastPunct = Math.max(textReply.lastIndexOf('.', 165), textReply.lastIndexOf('!', 165), textReply.lastIndexOf('?', 165));
      if (lastPunct > 50) {
        textReply = textReply.slice(0, lastPunct + 1).trim();
      } else {
        textReply = textReply.slice(0, 165).trim() + '...';
      }
    }

    // 2. Decide uso de TTS: só fala em voz alta (!tts) se a própria IA decidiu colocar !tts na resposta!
    const wantsTts = /^\s*!tts\b/i.test(textReply);
    if (wantsTts) {
      const speech = textReply.replace(/^\s*!tts\s*/i, '').trim();
      return send(`!tts @${msg.displayName} ${speech}`);
    }

    // Caso contrário, responde em texto puro no chat (SEM TTS forçado)
    return send(`@${msg.displayName} ${textReply}`);
  }

  const handlers = {
    play: cmdPlay, skip: cmdSkip, queue: cmdQueue, np: cmdNp, vol: cmdVol,
    pause: cmdPause, resume: cmdResume, stop: cmdStop, remove: cmdRemove,
    clear: cmdClear, shuffle: cmdShuffle, help: cmdHelp, ping: cmdPing,
    addcom: cmdAddcom, delcom: cmdDelcom, ia: cmdIa,
  };

  const ALIASES = aliasMap();

  return async function run(msg) {
    const text = String(msg.text || '').trim();
    if (!text.startsWith('!') || text.length > 500) return;
    if (msg.isEcho) return;

    // Deduplicação de mensagens Twitch pelo messageId
    if (msg.messageId) {
      if (seenMsgIds.has(msg.messageId)) return;
      seenMsgIds.add(msg.messageId);
      if (seenMsgIds.size > 200) {
        const first = seenMsgIds.values().next().value;
        seenMsgIds.delete(first);
      }
    }

    const [rawName, ...args] = text.slice(1).split(/\s+/);
    const name = (rawName || '').toLowerCase();
    if (!name) return;

    const meta = ALIASES.get(name);
    if (meta) {
      if (store.state.config.commands && store.state.config.commands[meta.id] === 0) return; // desligado explicitamente
      const perm = store.state.config.cmdPermissions?.[meta.id] || meta.who || 'all';
      if (!canUserRun(perm, msg)) return;                // sem permissão: ignora em silêncio
      try {
        await handlers[meta.id](args, msg);
      } catch (e) {
        console.error('[alive] comando ' + meta.id + ':', e);
        send(L(
          `Erro ao executar !${meta.id}, ${msg.displayName}. Tente de novo.`,
          `Error running !${meta.id}, ${msg.displayName}. Try again.`,
          `Error al ejecutar !${meta.id}, ${msg.displayName}. Intenta de nuevo.`
        ));
      }
      return;
    }

    // Comandos personalizados
    const custom = store.state.config.custom[name];
    if (custom) {
      const perm = custom.perm || (custom.modsOnly ? 'mod' : 'all');
      if (!canUserRun(perm, msg)) return;
      if (!cooldownOk(msg, name, Number(custom.cd) || 10)) return;
      return send(fillVars(custom.text, msg, store.state));
    }
  };
}
