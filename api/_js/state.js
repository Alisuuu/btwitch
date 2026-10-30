// Alive Bot — estado compartilhado entre navegador e servidor (isomórfico).
// Sem APIs do browser aqui: este módulo é importado também pelas functions da Vercel.

export const LS_STATE = 'alive.state.v1';
export const LS_TOKEN = 'alive.token';
export const LS_CLIENT = 'alive.clientId';
export const LS_SECRET = 'alive.secret';
export const LS_HEART = 'alive.heartbeat';

export function defaultState() {
  return {
    rev: 0,
    updatedAt: 0,
    now: null,          // música tocando {id,title,channel,thumb,duration,requestedBy,position,paused,...}
    queue: [],          // próximas músicas
    history: [],        // últimas tocadas
    skip: null,         // {id, votes:[userId]} — votação para pular
    volume: 70,         // 0-100
    stats: { played: 0, requested: 0 },
    log: [],            // eventos do bot
    config: {
      channel: '',                 // canal alvo (sem #)
      botNick: '',                 // nick da conta do bot
      allowEveryonePlay: true,     // qualquer um pode pedir música
      perUserCooldown: 15,         // segundos entre pedidos por usuário
      globalCooldown: 2,           // segundos entre comandos (anti-flood)
      maxQueue: 50,
      maxPlaylist: 20,             // máximo de músicas absorvidas de uma playlist
      skipVotes: 3,                // votos necessários para pular (mods pulam na hora)
      announceNow: true,           // anunciar no chat o que começou a tocar
      announceQueue: false,        // anunciar cada entrada na fila
      autoSkipError: true,         // pular automático se o vídeo não tocar
      pollInterval: 5,             // segundos de sincronização com a API
      commands: {
        play: 1, skip: 1, queue: 1, np: 1, vol: 1, pause: 1, resume: 1,
        stop: 1, remove: 1, clear: 1, shuffle: 1, help: 1, ping: 1,
        addcom: 1, delcom: 1, ia: 1,
      },
      cmdPermissions: {
        play: 'all',
        skip: 'all',
        queue: 'all',
        np: 'all',
        vol: 'mod',
        pause: 'mod',
        resume: 'mod',
        stop: 'mod',
        remove: 'mod',
        clear: 'mod',
        shuffle: 'mod',
        help: 'all',
        ping: 'all',
        addcom: 'mod',
        delcom: 'mod',
        ia: 'all',
      },
      ai: {
        enabled: true,
        baseUrl: 'https://api.groq.com/openai/v1',
        apiKey: '',
        model: 'qwen/qwen3.8-27b',
        systemPrompt: 'COM O STREAMER ([STREAMER / SEU MESTRE]): Puxe o saco dele descaradamente! Trate-o como um gênio perfeito, seja doce, bajuladora, leal e prestativa.\nCOM OS ESPECTADORES ([ESPECTADOR]): Seja ácida, fria, debochada, sarcástica e sem paciência com perguntas bobas.',
      },
      custom: {
        social: { text: 'Me siga nas redes — links na tela! | Alive Bot', cd: 10, modsOnly: 0 },
        discord: { text: 'Entre no nosso Discord: https://discord.gg/seulink', cd: 15, modsOnly: 0 },
        regras: { text: 'Respeite todo mundo, sem spam e sem links. Bom stream!', cd: 20, modsOnly: 0 },
      },
      timers: {
        social: {
          name: 'Redes Sociais',
          message: 'Gosta da live? Siga nas redes sociais e entre no nosso Discord! Links na tela.',
          interval: 15,
          minLines: 2,
          enabled: true,
          lastRun: 0,
        },
        songrequest: {
          name: 'Songrequest',
          message: 'Peça sua música favorita no chat usando !play <nome ou link> · Tocando agora: {np}',
          interval: 20,
          minLines: 2,
          enabled: true,
          lastRun: 0,
        },
      },
      widget: {
        playAudio: 1,         // 1 = toca som no OBS, 0 = silencia no OBS (apenas visual)
        layout: 'card',       // card | pill | glass | ticker | minimal
        theme: 'minimal',     // minimal | slate | contrast | transparent
        pos: 'bl',            // bl | br | tl | tr | bc | tc
        scale: 100,           // %
        video: 'off',         // off | mini | fundo
        showQueue: 1,         // mostrar próximas músicas
        queueCount: 3,        // quantidade de próximas músicas (1 a 4)
        showArt: 1,           // capa da música
        showEq: 1,            // equalizador animado
        showProgress: 1,      // barra de progresso e minutos
        showRequester: 1,     // nome de quem pediu a música
        showHint: 1,          // dica "Peça no chat com !play"
        showLogo: 1,          // marca d'água oficial Alive Bot
        hideIdle: 0,          // 0 = mostra card de espera, 1 = oculta quando fila vazia
        marquee: 1,           // 1 = título longo rola suavemente, 0 = corta com ...
      },
      discord: {
        enabled: true,
        guildId: '',
        webhookUrl: '',
        channelName: 'lives',
        mention: 'everyone',
        roleId: '',
        message: '[LIVE] **{streamer}** está ao vivo na Twitch | **{game}**',
        embedColor: '#9146FF',
        embedTitle: '▸ {title}',
        embedDesc: 'Transmissão iniciada. Venha interagir no chat e pedir músicas.',
        includeThumbnail: true,
        lastStreamId: '',
        lastNotifiedAt: 0,
      },
    },
  };
}

function cleanItem(it) {
  if (!it || !it.id) return null;
  return {
    id: String(it.id),
    title: String(it.title || 'Vídeo ' + it.id),
    channel: String(it.channel || ''),
    thumb: String(it.thumb || thumbFor(it.id)),
    duration: Number(it.duration) || 0,
    requestedBy: String(it.requestedBy || '?'),
    requestedAt: Number(it.requestedAt) || Date.now(),
    startedAt: Number(it.startedAt) || 0,
    position: Math.max(0, Number(it.position) || 0),
    paused: !!it.paused,
  };
}

export function sanitize(raw) {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  const rc = raw.config || {};
  const out = { ...base, ...raw };

  out.config = {
    ...base.config,
    ...rc,
    commands: { ...base.config.commands, ...(rc.commands || {}) },
    cmdPermissions: { ...base.config.cmdPermissions, ...(rc.cmdPermissions || {}) },
    custom: { ...(rc.custom || {}) },
    widget: { ...base.config.widget, ...(rc.widget || {}) },
  };

  const rawAi = rc.ai || base.config.ai || {};
  out.config.ai = {
    enabled: rawAi.enabled === true,
    baseUrl: String(rawAi.baseUrl || base.config.ai.baseUrl).trim(),
    apiKey: String(rawAi.apiKey || base.config.ai.apiKey).trim(),
    model: String(rawAi.model || base.config.ai.model).trim(),
    systemPrompt: String(rawAi.systemPrompt !== undefined ? rawAi.systemPrompt : base.config.ai.systemPrompt).slice(0, 4000),
  };

  const cleanTimers = {};
  const rawTimers = rc.timers || base.config.timers;
  if (rawTimers && typeof rawTimers === 'object') {
    for (const [id, t] of Object.entries(rawTimers)) {
      if (!t || typeof t !== 'object') continue;
      const cleanId = String(id).toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30);
      if (!cleanId) continue;
      cleanTimers[cleanId] = {
        name: String(t.name || cleanId).slice(0, 40),
        message: String(t.message || '').slice(0, 450),
        interval: clampInt(t.interval, 1, 360, 15),
        minLines: clampInt(t.minLines, 0, 100, 2),
        enabled: t.enabled !== false,
        lastRun: Number(t.lastRun) || 0,
      };
    }
  }
  out.config.timers = cleanTimers;

  const rawDc = rc.discord || base.config.discord || {};
  out.config.discord = {
    enabled: rawDc.enabled !== false,
    guildId: String(rawDc.guildId || '').trim(),
    webhookUrl: String(rawDc.webhookUrl || '').trim(),
    channelName: String(rawDc.channelName || 'lives').trim(),
    mention: String(rawDc.mention || 'everyone').trim(),
    roleId: String(rawDc.roleId || '').trim(),
    message: String(rawDc.message || '[LIVE] **{streamer}** está ao vivo na Twitch | **{game}**').trim(),
    embedColor: String(rawDc.embedColor || '#9146FF').trim(),
    embedTitle: String(rawDc.embedTitle || '▸ {title}').trim(),
    embedDesc: String(rawDc.embedDesc || 'Transmissão iniciada. Venha interagir no chat e pedir músicas.').trim(),
    includeThumbnail: rawDc.includeThumbnail !== false,
    lastStreamId: String(rawDc.lastStreamId || ''),
    lastNotifiedAt: Number(rawDc.lastNotifiedAt) || 0,
  };

  out.config.channel = String(out.config.channel || '').replace(/^#/, '').trim().toLowerCase();
  out.config.botNick = String(out.config.botNick || '').trim().toLowerCase();
  out.config.maxQueue = clampInt(out.config.maxQueue, 1, 500, 50);
  out.config.maxPlaylist = clampInt(out.config.maxPlaylist, 1, 100, 20);
  out.config.perUserCooldown = clampInt(out.config.perUserCooldown, 0, 3600, 15);
  out.config.globalCooldown = clampInt(out.config.globalCooldown, 0, 60, 2);
  out.config.skipVotes = clampInt(out.config.skipVotes, 1, 50, 3);
  out.config.pollInterval = clampInt(out.config.pollInterval, 2, 300, 5);

  out.stats = { ...base.stats, ...(raw.stats || {}) };
  out.volume = clampInt(raw.volume, 0, 100, 70);
  out.rev = Number(raw.rev) || 0;
  out.updatedAt = Number(raw.updatedAt) || 0;
  out.now = cleanItem(raw.now);
  out.queue = (Array.isArray(raw.queue) ? raw.queue : []).map(cleanItem).filter(Boolean);
  out.history = (Array.isArray(raw.history) ? raw.history : []).slice(0, 30);
  out.log = (Array.isArray(raw.log) ? raw.log : []).slice(0, 60);
  out.skip = raw.skip && typeof raw.skip === 'object' && Array.isArray(raw.skip.votes)
    ? { id: String(raw.skip.id || ''), votes: raw.skip.votes.map(String).slice(0, 100) }
    : null;

  // Limpa músicas antigas que ficaram abandonadas por horas
  if (out.now) {
    if (!out.now.startedAt) {
      out.now.startedAt = Date.now();
    }
    const durSec = (out.now.duration || 300);
    const ageSec = (Date.now() - out.now.startedAt) / 1000;
    // Só descarta se a música realmente já passou do tempo de duração e esteve abandonada por mais de 2 horas
    if (!out.now.paused && ageSec > (durSec + 7200)) {
      if (!out.history.some((h) => h.id === out.now.id)) {
        out.history.unshift({ ...out.now, finishedAt: Date.now() });
        out.history = out.history.slice(0, 30);
      }
      out.now = null;
    }
  }
  return out;
}

export function clone(o) { return JSON.parse(JSON.stringify(o)); }

// Avança a fila: atual → histórico, próxima → atual. Usado pelo widget (fim do vídeo)
// e pelos comandos !skip/!parar do painel.
export function advanceQueue(s) {
  if (s.now) {
    s.history.unshift({ ...s.now, finishedAt: Date.now() });
    s.history = s.history.slice(0, 30);
    s.stats.played = (s.stats.played || 0) + 1;
  }
  s.skip = null;
  const next = s.queue.shift() || null;
  s.now = next
    ? { ...next, startedAt: Date.now(), position: 0, paused: false }
    : null;
  return s.now;
}

export function clampInt(v, min, max, dflt) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}

export function pushLog(state, type, text) {
  state.log = [{ t: Date.now(), type: type || 'info', text: String(text).slice(0, 300) }, ...(state.log || [])].slice(0, 60);
}

export function fmtTime(sec) {
  sec = Math.floor(Number(sec) || 0);
  if (sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return h ? `${h}:${mm}:${String(s).padStart(2, '0')}` : `${mm}:${String(s).padStart(2, '0')}`;
}

export function thumbFor(id) {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

export function short(s, n = 55) {
  s = String(s || '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
