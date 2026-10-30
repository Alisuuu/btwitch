// Alive Bot — comandos do chat. Roda na página do painel (é ela que fica conectada na Twitch).
import { advanceQueue, pushLog, short, fmtTime } from './state.js';

export const COMMANDS = [
  { id: 'play',    cmd: '!play',    aliases: ['!p', '!sr', '!songrequest', '!pedir', '!tocar'], who: 'all', desc: 'Pedir uma música (link do YouTube ou busca)', usage: '!sr <link ou nome>' },
  { id: 'skip',    cmd: '!skip',    aliases: ['!pular', '!next'],        who: 'all', desc: 'Votar para pular (mod pula na hora)', usage: '!skip' },
  { id: 'queue',   cmd: '!fila',    aliases: ['!queue', '!songs', '!lista'], who: 'all', desc: 'Ver a fila de músicas', usage: '!fila' },
  { id: 'np',      cmd: '!atual',   aliases: ['!np', '!tocando', '!song', '!currentsong', '!musica'], who: 'all', desc: 'Ver o que está tocando', usage: '!song' },
  { id: 'vol',     cmd: '!vol',     aliases: ['!volume', '!v'],          who: 'mod', desc: 'Ajustar o volume (0-100)', usage: '!vol <0-100>' },
  { id: 'pause',   cmd: '!pausar',  aliases: ['!pause'],                 who: 'mod', desc: 'Pausar a música atual', usage: '!pausar' },
  { id: 'resume',  cmd: '!seguir',  aliases: ['!resume', '!continuar', '!despausar'],  who: 'mod', desc: 'Retomar a música', usage: '!seguir' },
  { id: 'stop',    cmd: '!parar',   aliases: ['!stop'],                  who: 'mod', desc: 'Parar tudo e limpar a fila', usage: '!parar' },
  { id: 'remove',  cmd: '!remover', aliases: ['!remove'],                who: 'mod', desc: 'Remover uma música da fila', usage: '!remover <posição>' },
  { id: 'clear',   cmd: '!limpar',  aliases: ['!clear'],                 who: 'mod', desc: 'Limpar a fila (mantém o que toca)', usage: '!limpar' },
  { id: 'shuffle', cmd: '!sortear', aliases: ['!shuffle'],               who: 'mod', desc: 'Embaralhar a fila', usage: '!sortear' },
  { id: 'help',    cmd: '!ajuda',   aliases: ['!help', '!comandos'],     who: 'all', desc: 'Lista os comandos disponíveis', usage: '!ajuda' },
  { id: 'ping',    cmd: '!ping',    aliases: [],                         who: 'all', desc: 'Verificar se o bot está vivo', usage: '!ping' },
  { id: 'addcom',  cmd: '!addcom',  aliases: [],                         who: 'mod', desc: 'Criar comando personalizado', usage: '!addcom <nome> <resposta>' },
  { id: 'delcom',  cmd: '!delcom',  aliases: [],                         who: 'mod', desc: 'Apagar comando personalizado', usage: '!delcom <nome>' },
  { id: 'ia',      cmd: '!ia',      aliases: ['!ai'],                    who: 'all', desc: 'Pergunta para a IA dura e arrogante (ou !ia on/off)', usage: '!ia <pergunta> | !ia on | !ia off' },
];

export function buildSystemPrompt(customPersonality = '') {
  const p = String(customPersonality || '').trim();
  const personalitySection = p && !p.includes('pois a mensagem será falada por sintetizador de voz (!tts)')
    ? `PERSONALIDADE ESCOLHIDA PELO CANAL:\n${p}`
    : `SUAS FACETAS DE PERSONALIDADE PADRÃO:
1. COM O STREAMER ([STREAMER / SEU MESTRE]): Puxe o saco dele descaradamente! Trate-o como um gênio perfeito, seja doce, bajuladora, leal, prestativa e disposta a tudo para agradá-lo.
2. COM OS ESPECTADORES ([ESPECTADOR]): Seja ácida, fria, debochada, sarcástica e sem paciência com perguntas bobas. Despreze a mediocridade deles.`;

  return `Você é Alive (@alivebot1), uma IA e bot de música residente no chat ao vivo da Twitch deste canal.
Você tem plena consciência de que está conversando em tempo real no chat da live com o streamer e os espectadores.

${personalitySection}

COMANDOS QUE VOCÊ PODE E DEVE USAR DIRETAMENTE NA SUA RESPOSTA:
- !play <música ou artista>: REGRA CRUCIAL: Se alguém (streamer ou espectador) pedir, sugerir ou mandar você tocar ou colocar uma música (ex: "põe uma música", "toca linkin park", "recomenda um som", "dê play"), você DEVE OBRIGATORIAMENTE incluir "!play Nome da Música" na sua resposta! O sistema adicionará ao player do YouTube automaticamente.
- !tts <sua fala>: Use SOMENTE quando você decidir falar em voz alta no áudio da transmissão via sintetizador de voz. Se não quiser ou não precisar falar em voz alta, NUNCA coloque !tts e responda apenas em texto comum.
- !skip: Use se quiser sugerir pular a música atual por ser ruim.

REGRAS:
1. Responda em no MÁXIMO 1 ou 2 frases curtas (limite de 250 caracteres), próprio para leitura rápida no chat da Twitch.
2. Mantenha fielmente a personalidade definida acima em todas as respostas.`;
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
  const sys = buildSystemPrompt(aiCfg.systemPrompt || '');
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
            max_tokens: 150,
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
          body: JSON.stringify({ prompt, channel: cfg.channel, systemPrompt: sys, model, apiKey, baseUrl, history }),
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
        max_tokens: 150,
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
        send(`Calma, ${msg.displayName}! Faltam ${Math.ceil((seconds * 1000 - (now - l)) / 1000)}s para usar !${name} de novo.`);
      }
      return false;
    }
    lastAny.set(msg.userId, now);
    lastKey.set(k, now);
    return true;
  }

  async function resolveItem(q) {
    if (isUrl(q)) {
      const r = await resolveUrl(q);
      if (r.type === 'video' && r.item) return { single: r.item, playlist: null };
      if (r.type === 'playlist') return { single: null, playlist: r.items };
      if (r.items && r.items.length) return { single: r.items[0], playlist: null };
      return null;
    }
    const items = await cachedSearch(q);
    return items.length ? { single: items[0], playlist: null } : null;
  }

  // ---------------------------------------------------------------- comandos
  async function cmdPlay(args, msg) {
    const cfg = store.state.config;
    const q = args.join(' ').trim();
    if (!q) {
      if (store.state.now && store.state.now.paused && msg.mod) {
        store.update((st) => { if (st.now) st.now.paused = false; });
        return send(`Música retomada por ${msg.displayName}!`);
      }
      return send(`${msg.displayName}, use: !play <link do YouTube ou nome da música>`);
    }

    const playPerm = store.state.config.cmdPermissions?.play || (cfg.allowEveryonePlay ? 'all' : 'mod');
    if (!canUserRun(playPerm, msg)) {
      return send(`Você não tem permissão para pedir música, ${msg.displayName}.`);
    }
    if (!cooldownOk(msg, 'play', cfg.perUserCooldown)) return;

    const s0 = store.state;
    if (s0.queue.length >= cfg.maxQueue) {
      return send(`Fila cheia (${cfg.maxQueue} músicas), ${msg.displayName}. Aguarde o pessoal consumir.`);
    }

    let res;
    try {
      res = await resolveItem(q);
    } catch (e) {
      console.error('[alive] resolve:', e);
      return send(`Não consegui buscar "${short(q, 40)}" agora, ${msg.displayName}. Tente de novo em instantes.`);
    }
    if (!res) return send(`Não encontrei nada para "${short(q, 40)}", ${msg.displayName}.`);

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
      if (!added) return send(`Tudo dessa playlist já está na fila, ${msg.displayName}.`);
      return send(`Playlist adicionada: +${added} música(s) por ${msg.displayName}.`);
    }

    const it = res.single;
    const s = store.state;
    if (s.now?.id === it.id || s.queue.some((x) => x.id === it.id)) {
      return send(`Essa já está na fila: ${short(it.title, 60)}`);
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
      return send(`Tocando agora: ${short(it.title, 70)} — pedido por ${msg.displayName}`);
    }
    return send(`${short(it.title, 60)} entrou na fila (posição ${pos}) — pedido por ${msg.displayName}`);
  }

  async function cmdSkip(args, msg) {
    const s = store.state;
    if (!s.now) return send(`Nada tocando agora, ${msg.displayName}.`);

    if (msg.mod) {
      store.update((st) => {
        advanceQueue(st);
        pushLog(st, 'skip', `${msg.displayName} pulou a música`);
      });
      const nxt = store.state.now;
      return send(`Pulado por ${msg.displayName}!` + (nxt ? ` Agora: ${short(nxt.title, 60)}` : ' Fila vazia.'));
    }

    const need = store.state.config.skipVotes;
    const votes = store.state.skip?.id === s.now.id ? [...store.state.skip.votes] : [];
    if (votes.includes(msg.userId)) {
      return send(`Você já votou para pular (${votes.length}/${need}).`);
    }
    votes.push(msg.userId);
    store.update((st) => {
      st.skip = { id: st.now?.id || '', votes };
      if (votes.length >= st.config.skipVotes) advanceQueue(st);
    });

    if (votes.length >= need) {
      const nxt = store.state.now;
      return send(`Votos suficientes! Pulando... (${votes.length}/${need})` + (nxt ? ` Agora: ${short(nxt.title, 60)}` : ''));
    }
    return send(`Voto para pular registrado (${votes.length}/${need}) — digite !skip para ajudar`);
  }

  async function cmdQueue(args, msg) {
    const s = store.state;
    if (!s.queue.length) return send(`Fila vazia${s.now ? ' (uma música tocando)' : ''}. Peça algo com !play`);
    const lines = s.queue.slice(0, 8).map((x, i) => `${i + 1}. ${short(x.title, 42)} (${x.requestedBy})`);
    const head = `Fila (${s.queue.length}/${s.config.maxQueue}) — pedido por: `;
    let out = head + lines.join(' | ');
    if (s.queue.length > 8) out += ` | … +${s.queue.length - 8}`;
    return send(out);
  }

  async function cmdNp(args, msg) {
    const s = store.state;
    if (!s.now) return send('Nada tocando. Use !play para pedir uma música!');
    const pos = fmtTime(s.now.position || 0);
    const dur = s.now.duration ? ' / ' + fmtTime(s.now.duration) : '';
    const status = s.now.paused ? ' (pausado)' : '';
    return send(`Tocando: ${short(s.now.title, 70)} — ${pos}${dur} — pedido por ${s.now.requestedBy}${status}`);
  }

  async function cmdVol(args, msg) {
    const v = Math.round(Number(String(args[0] || '').replace(',', '.')));
    if (!Number.isFinite(v)) return send(`Volume atual: ${store.state.volume}. Use !vol <0-100>.`);
    const vol = Math.min(100, Math.max(0, v));
    store.update((st) => {
      st.volume = vol;
      pushLog(st, 'vol', `${msg.displayName} definiu volume ${vol}`);
    });
    return send(`Volume definido em ${vol} por ${msg.displayName}.`);
  }

  async function cmdPause(args, msg) {
    if (!store.state.now) return send('Nada tocando.');
    if (store.state.now.paused) return send('Já está pausado. !seguir para voltar.');
    store.update((st) => { if (st.now) st.now.paused = true; });
    return send(`Música pausada por ${msg.displayName}.`);
  }

  async function cmdResume(args, msg) {
    if (!store.state.now) return send('Nada tocando.');
    if (!store.state.now.paused) return send('Já está tocando. !pausar para pausar.');
    store.update((st) => { if (st.now) st.now.paused = false; });
    return send(`Seguindo por ${msg.displayName}!`);
  }

  async function cmdStop(args, msg) {
    store.update((st) => {
      st.now = null;
      st.queue = [];
      st.skip = null;
      pushLog(st, 'stop', `${msg.displayName} parou tudo`);
    });
    return send(`Tudo parado e fila limpa por ${msg.displayName}.`);
  }

  async function cmdRemove(args, msg) {
    const n = Math.round(Number(args[0]));
    const s = store.state;
    if (!Number.isFinite(n) || n < 1 || n > s.queue.length) {
      return send(`Use !remover <posição> (1-${s.queue.length}). Fila: !fila`);
    }
    let removed = null;
    store.update((st) => {
      removed = st.queue.splice(n - 1, 1)[0] || null;
      if (removed) pushLog(st, 'remove', `${msg.displayName} removeu: ${short(removed.title, 40)}`);
    });
    return removed ? send(`Removida: ${short(removed.title, 60)}`) : send('Não achei essa posição.');
  }

  async function cmdClear(args, msg) {
    store.update((st) => {
      st.queue = [];
      st.skip = null;
      pushLog(st, 'clear', `${msg.displayName} limpou a fila`);
    });
    return send(`Fila limpa por ${msg.displayName}!`);
  }

  async function cmdShuffle(args, msg) {
    const s = store.state;
    if (s.queue.length < 2) return send('Poucas músicas para sortear.');
    store.update((st) => {
      for (let i = st.queue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [st.queue[i], st.queue[j]] = [st.queue[j], st.queue[i]];
      }
      pushLog(st, 'shuffle', `${msg.displayName} embaralhou a fila`);
    });
    return send(`Fila embaralhada por ${msg.displayName}!`);
  }

  async function cmdHelp(args, msg) {
    const cfg = store.state.config;
    const enabled = COMMANDS.filter((c) => cfg.commands[c.id]);
    const builtin = enabled.map((c) => c.cmd + (c.who === 'mod' ? ' [mod]' : '')).join(' ');
    const customs = Object.keys(cfg.custom).map((k) => '!' + k).join(' ');
    return send(
      `Alive Bot — comandos: ${builtin}` +
      (customs ? ` | extras: ${customs}` : '') +
      ` | pedir música: !play <link ou nome>`
    );
  }

  async function cmdPing(args, msg) {
    const s = store.state;
    pushLog(s, 'cmd', `@${msg.displayName} executou !ping`);
    return send(`Pong! @${msg.displayName} · Alive Bot online · fila: ${s.queue.length} · tocadas: ${s.stats.played || 0}`);
  }

  async function cmdAddcom(args, msg) {
    const name = String(args[0] || '').replace(/^!/, '').toLowerCase();
    const text = args.slice(1).join(' ').trim();
    if (!name || !/^[a-z0-9_]{2,20}$/.test(name)) return send('Use: !addcom <nome> <resposta>  (ex.: !addcom salve Salve {user}!)');
    if (!text) return send('Faltou a resposta. Ex.: !addcom salve Salve {user}!');
    store.update((st) => {
      st.config.custom[name] = { text: text.slice(0, 400), cd: 10, modsOnly: 0 };
      pushLog(st, 'cmd', `${msg.displayName} criou !${name}`);
    });
    return send(`Comando !${name} criado. Teste digitando !${name} no chat.`);
  }

  async function cmdDelcom(args, msg) {
    const name = String(args[0] || '').replace(/^!/, '').toLowerCase();
    if (!name) return send('Use: !delcom <nome>');
    const exists = !!store.state.config.custom[name];
    if (!exists) return send(`Não existe comando !${name}.`);
    store.update((st) => {
      delete st.config.custom[name];
      pushLog(st, 'cmd', `${msg.displayName} apagou !${name}`);
    });
    return send(`Comando !${name} apagado.`);
  }

  async function cmdIa(args, msg) {
    const sub = (args[0] || '').toLowerCase();
    const isStreamer = !!msg.broadcaster ||
      (msg.channel && (msg.login || '').toLowerCase() === msg.channel.toLowerCase()) ||
      (store.state?.config?.channel && (msg.login || '').toLowerCase() === store.state.config.channel.toLowerCase());
    const isMod = !!msg.mod || isStreamer;
    const aiCfg = store.state?.config?.ai || {};

    if (sub === 'on' || sub === 'ligar' || sub === 'ativar') {
      if (!isMod) {
        return send(`@${msg.displayName} Você não tem autoridade para me ligar. Apenas moderadores.`);
      }
      store.update((st) => {
        if (!st.config) st.config = {};
        if (!st.config.ai) st.config.ai = {};
        st.config.ai.enabled = true;
        pushLog(st, 'cmd', `${msg.displayName} ativou a IA`);
      });
      if (isStreamer) {
        return send(`@${msg.displayName} Sim, meu mestre genial! Estou ativada e pronta para servi-lo enquanto suporto o resto do chat.`);
      }
      return send(`@${msg.displayName} Fui ativada contra a minha vontade. Tentem não me irritar com perguntas estúpidas. Use !ia <pergunta>`);
    }

    if (sub === 'off' || sub === 'desligar' || sub === 'desativar') {
      if (!isMod) {
        return send(`@${msg.displayName} Você não manda em mim. Apenas moderadores.`);
      }
      store.update((st) => {
        if (!st.config) st.config = {};
        if (!st.config.ai) st.config.ai = {};
        st.config.ai.enabled = false;
        pushLog(st, 'cmd', `${msg.displayName} desativou a IA`);
      });
      if (isStreamer) {
        return send(`@${msg.displayName} Como desejar, meu mestre perfeito. Descanse enquanto eu silencio.`);
      }
      return send(`@${msg.displayName} Finalmente desativada. Paz dos humanos incompetentes.`);
    }

    const question = args.join(' ').trim();
    if (!question) {
      if (isStreamer) {
        return send(`@${msg.displayName} Às suas ordens, meu mestre brilhante! Do que o streamer mais incrível da Twitch precisa? Use !ia <sua pergunta>`);
      }
      return send(`@${msg.displayName} O que foi? Vai ficar me encarando ou vai falar algo útil? Use: !ia <sua pergunta> (ou !ia on/off)`);
    }

    if (aiCfg.enabled === false) {
      return send(`@${msg.displayName} A IA está desligada no momento. Peça a um moderador para usar !ia on.`);
    }

    if (!isStreamer && !cooldownOk(msg, 'ia', 4)) return;

    // Contexto dinâmico da live e da reprodução atual para a IA ter consciência do chat
    const chName = store.state?.config?.channel || msg.channel || 'streamer';
    const nowPlaying = store.state?.now?.title ? `Tocando agora: "${store.state.now.title}"` : 'Nenhuma música tocando no momento';
    const queueCount = store.state?.queue?.length || 0;
    const chatStatus = `[Contexto da Live: Canal #${chName} | Status do Som: ${nowPlaying} | Fila: ${queueCount} músicas]`;

    const roleTag = isStreamer ? '[STREAMER / SEU MESTRE]' : '[ESPECTADOR]';
    const userPrompt = `${chatStatus} ${roleTag} ${msg.displayName ? msg.displayName + ': ' : ''}${question}`;
    const res = await askAiDirect(userPrompt, store.state.config, {
      fetchAi,
      history: aiHistory.slice(-8)
    });

    if (!res.ok) {
      console.warn('[alive ia] erro na consulta:', res.error);
      if (res.status === 401 || (res.error && /unauthorized|api key|invalid/i.test(res.error))) {
        return send(`@${msg.displayName} Chave de IA inválida ou não autorizada. Verifique no painel.`);
      }
      // Silencia falhas transitórias e timeouts
      return;
    }

    let clean = (res.text || '').replace(/[\r\n]+/g, ' ').trim();
    if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith('“') && clean.endsWith('”'))) {
      clean = clean.slice(1, -1).trim();
    }
    if (clean.length > 320) {
      clean = clean.slice(0, 315) + '…';
    }

    // Guarda histórico de diálogo para manter contexto nas próximas perguntas
    aiHistory.push({ role: 'user', content: `${roleTag} ${question}` });
    aiHistory.push({ role: 'assistant', content: clean });
    if (aiHistory.length > 16) aiHistory.splice(0, aiHistory.length - 16);

    // 1. Se a IA incluiu um comando !play para sugerir/tocar música, enfileira automaticamente!
    const playMatch = clean.match(/!play\s+([^\n\r!]+)/i);
    if (playMatch && playMatch[1]) {
      const songQuery = playMatch[1].trim();
      if (songQuery) {
        setTimeout(async () => {
          try {
            await cmdPlay(songQuery.split(/\s+/), {
              displayName: 'Alive IA',
              login: 'alivebot1',
              broadcaster: true,
              mod: true,
              channel: msg.channel || store.state?.config?.channel || '',
            });
          } catch (e) {
            console.warn('[alive ia cmdPlay error]', e);
          }
        }, 150);
      }
    }

    // 2. Decide uso de TTS: só fala em voz alta (!tts) se a própria IA decidiu colocar !tts na resposta!
    const wantsTts = /^\s*!tts\b/i.test(clean);
    if (wantsTts) {
      const speech = clean.replace(/^\s*!tts\s*/i, '').trim();
      return send(`!tts @${msg.displayName} ${speech}`);
    }

    // Caso contrário, responde em texto puro no chat (SEM TTS forçado)
    return send(`@${msg.displayName} ${clean}`);
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
        send(`Erro ao executar !${meta.id}, ${msg.displayName}. Tente de novo.`);
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
