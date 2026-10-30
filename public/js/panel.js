// Alive Bot — Painel de Controle e Monitoramento
import { Store } from './store.js';
import { TwitchIRC } from './irc.js';
import { createRunner, COMMANDS, fillVars } from './commands.js';
import {
  advanceQueue, pushLog, fmtTime, short, thumbFor, clone,
  LS_TOKEN, LS_CLIENT, LS_SECRET,
} from './state.js';
import { icon, renderIcons } from './icons.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

// Renderiza ícones imediatamente
try { renderIcons(document); } catch { /* ignora */ }
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { try { renderIcons(document); } catch { /* */ } });
}

const urlParams = new URLSearchParams(location.search);

function getAuthStreamer() {
  try {
    const token = (localStorage.getItem(LS_TOKEN) || '').trim();
    const tokenLogin = (localStorage.getItem('alive.tokenLogin') || '').trim();
    const raw = localStorage.getItem('alive.user');
    const u = raw ? JSON.parse(raw) : null;
    const login = (tokenLogin || u?.login || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (token && login) {
      return { token, login, user: u };
    }
  } catch {}
  return null;
}

const authStreamer = getAuthStreamer();
const hasOAuthTokenInHash = typeof location !== 'undefined' && location.hash && location.hash.includes('access_token=');

// SEGURANÇA: O painel só pode ser acessado pelo streamer autenticado!
// Se estiver em guia anônima ou não logado, bloqueia acesso a qualquer canal com o Auth Gate
let currentChannel = authStreamer ? authStreamer.login : '';

const store = new Store(currentChannel);
let irc = null;
let runner = null;
let runnerBusy = false;
let prevNowId = null;
let prevQueueLen = 0;
let firstSync = true;
const chatLines = [];
let editingCmd = null;
let serverBotState = { running: false, connected: false };
let lastServerChatTime = 0;

// Player do YouTube no navegador do painel
let panelPlayer = null;
let ytApiReady = false;
let curPlayingId = null;
let userInteracted = false;
let webAudioMuted = localStorage.getItem('alive.webMuted') === '1';
let retryingPanelAlt = false;

function updateWebMuteUI() {
  const btn = $('#btnWebMute');
  const ic = $('#webMuteIcon');
  if (btn) {
    btn.classList.toggle('muted', webAudioMuted);
    btn.title = webAudioMuted
      ? 'Som do navegador silenciado (o OBS continua tocando normalmente). Clique para ativar som.'
      : 'Som do navegador ativo. Clique para mutar apenas aqui no painel (o OBS continua tocando).';
  }
  if (ic) {
    ic.setAttribute('data-icon', webAudioMuted ? 'volume-x' : 'volume-2');
    ic.innerHTML = icon(webAudioMuted ? 'volume-x' : 'volume-2', { size: 16 });
  }
  try {
    if (panelPlayer) {
      if (webAudioMuted) {
        panelPlayer.mute?.();
      } else {
        panelPlayer.unMute?.();
        panelPlayer.setVolume?.(Number(store.state.volume ?? 70));
      }
    }
  } catch { /* ignora */ }
}

function markUserInteracted() {
  userInteracted = true;
  try {
    if (panelPlayer && typeof panelPlayer.unMute === 'function') {
      if (webAudioMuted) {
        panelPlayer.mute?.();
      } else {
        panelPlayer.unMute?.();
        panelPlayer.setVolume?.(Number(store.state.volume ?? 70));
      }
      if (store.state.now && !store.state.now.paused) {
        panelPlayer.playVideo?.();
      }
    }
  } catch { /* ignora */ }
}
window.addEventListener('click', markUserInteracted, { passive: true });
window.addEventListener('touchstart', markUserInteracted, { passive: true });

function loadYTApi() {
  return new Promise((resolve, reject) => {
    if (window.YT && window.YT.Player) return resolve(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prev === 'function') prev();
      resolve(window.YT);
    };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.onerror = () => reject(new Error('Falha ao carregar API do YouTube'));
    document.head.appendChild(tag);
  });
}

async function tryFindAlternativePanel(currentNow) {
  if (retryingPanelAlt || !currentNow) return;
  retryingPanelAlt = true;
  try {
    toast('Buscando versão com áudio liberado...');
    const cleanTitle = (currentNow.title || '')
      .replace(/\(Official.*?\)/gi, '')
      .replace(/\[Official.*?\]/gi, '')
      .replace(/ft\..*$/gi, '')
      .trim();
    const query = `${cleanTitle} audio`;
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=5`).then((r) => r.json()).catch(() => null);
    if (res && res.items && res.items.length) {
      const alt = res.items.find((it) => it.id !== currentNow.id);
      if (alt) {
        toast(`Tocando versão alternativa: ${alt.title}`);
        curPlayingId = alt.id;
        try {
          panelPlayer?.loadVideoById({ videoId: alt.id, startSeconds: 0 });
          if (!webAudioMuted && userInteracted) {
            panelPlayer?.unMute?.();
            panelPlayer?.setVolume?.(Number(store.state.volume ?? 70));
          }
        } catch (e) {
          console.warn('[alive panel] erro ao carregar alternativa:', e);
        }
        store.update((st) => {
          if (st.now && st.now.id === currentNow.id) {
            st.now.id = alt.id;
            st.now.title = alt.title;
            if (alt.thumb) st.now.thumb = alt.thumb;
            if (alt.duration) st.now.duration = alt.duration;
            st.now.position = 0;
            st.now.startedAt = Date.now();
            pushLog(st, 'play', `Alternativa liberada: ${alt.title}`);
          }
        });
        store.flush();
        return;
      }
    }
  } catch (err) {
    console.warn('[alive panel] erro ao buscar alternativa:', err);
  } finally {
    setTimeout(() => { retryingPanelAlt = false; }, 5000);
  }
}

async function initPanelPlayer() {
  try {
    const YT = await loadYTApi();
    panelPlayer = new YT.Player('panelYt', {
      width: '100%',
      height: '100%',
      playerVars: {
        autoplay: 0,
        controls: 1,
        disablekb: 0,
        fs: 0,
        rel: 0,
        playsinline: 1,
        enablejsapi: 1,
        origin: location.origin,
      },
      events: {
        onReady: () => {
          ytApiReady = true;
          if (userInteracted && !webAudioMuted) {
            try {
              panelPlayer.unMute?.();
              panelPlayer.setVolume?.(Number(store.state.volume ?? 70));
            } catch {}
          } else {
            try { panelPlayer.mute?.(); } catch {}
          }
          syncPanelPlayer(store.state);
        },
        onStateChange: (ev) => {
          const st = ev?.data;
          if (st === 1) { // PLAYING
            const d = panelPlayer?.getDuration?.() || 0;
            if (d > 0 && store.state.now?.id === curPlayingId && Math.abs((store.state.now.duration || 0) - d) > 1) {
              store.update((s) => { if (s.now?.id === curPlayingId) s.now.duration = Math.round(d); }, { remote: false });
            }
          } else if (st === 0) { // ENDED prematuro
            const cur = panelPlayer?.getCurrentTime?.() || 0;
            const dur = panelPlayer?.getDuration?.() || 0;
            if (dur > 5 && cur < 3) {
              console.warn('[alive panel] Vídeo abortado prematuramente aos 0s pelo YouTube, buscando alternativa...');
              tryFindAlternativePanel(store.state.now);
            }
          }
        },
        onError: (ev) => {
          const code = ev?.data;
          console.warn('[alive panel] erro player local do painel:', code);
          if (code === 101 || code === 150 || code === 2 || code === 5) {
            tryFindAlternativePanel(store.state.now);
          }
        }
      }
    });
  } catch (e) {
    console.warn('[alive panel] erro ao iniciar player do YouTube:', e);
  }
}

async function syncPanelPlayer(s) {
  const now = s.now;
  if (!now || !now.id) {
    if (curPlayingId) {
      curPlayingId = null;
      try { panelPlayer?.stopVideo?.(); } catch { /* */ }
    }
    return;
  }

  const vol = Number(s.volume ?? 70);
  const start = Math.max(0, Math.round(now.position || 0));

  if (curPlayingId !== now.id) {
    curPlayingId = now.id;
    if (!ytApiReady || !panelPlayer) return;

    try {
      if (now.paused) {
        if (typeof panelPlayer.cueVideoById === 'function') {
          panelPlayer.cueVideoById({ videoId: now.id, startSeconds: start });
        } else {
          panelPlayer.loadVideoById({ videoId: now.id, startSeconds: start });
          setTimeout(() => { try { panelPlayer.pauseVideo?.(); } catch {} }, 50);
        }
      } else if (webAudioMuted || !userInteracted) {
        if (typeof panelPlayer.cueVideoById === 'function') {
          panelPlayer.cueVideoById({ videoId: now.id, startSeconds: start });
        } else {
          panelPlayer.loadVideoById({ videoId: now.id, startSeconds: start });
          setTimeout(() => { try { panelPlayer.pauseVideo?.(); } catch {} }, 50);
        }
      } else {
        panelPlayer.loadVideoById({ videoId: now.id, startSeconds: start });
      }
      if (webAudioMuted || !userInteracted) {
        panelPlayer.mute?.();
      } else {
        panelPlayer.unMute?.();
        panelPlayer.setVolume?.(vol);
      }
      if (now.paused || webAudioMuted || !userInteracted) {
        panelPlayer.pauseVideo?.();
      } else {
        panelPlayer.playVideo?.();
      }
    } catch (e) {
      console.warn('[alive panel] loadVideoById erro:', e);
    }
    return;
  }

  if (ytApiReady && panelPlayer) {
    try {
      if (webAudioMuted || !userInteracted) {
        panelPlayer.mute?.();
      } else {
        panelPlayer.unMute?.();
        panelPlayer.setVolume?.(vol);
      }
      if (now.paused) {
        panelPlayer.pauseVideo?.();
      } else {
        panelPlayer.playVideo?.();
      }
    } catch { /* */ }
  }
}

// ------------------------------------------------------------------ utils
function toast(msg, ms = 2600) {
  const el = $('#toast');
  el.innerHTML = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, ms);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

async function fetchJson(url, opts) {
  const r = await fetch(url, opts);
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error || ('HTTP ' + r.status));
  return j;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>\"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function widgetUrl() {
  const origin = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? location.origin
    : 'https://btwitch.vercel.app';
  const w = store?.state?.config?.widget || {};
  const q = [];
  const ch = currentChannel || store?.state?.config?.channel;
  if (ch) q.push('channel=' + encodeURIComponent(ch));
  if (w.playAudio === 0) q.push('audio=0');
  if (w.layout) q.push('layout=' + encodeURIComponent(w.layout));
  if (w.theme) q.push('theme=' + encodeURIComponent(w.theme));
  if (w.scale && Number(w.scale) !== 100) q.push('scale=' + encodeURIComponent(w.scale));
  if (w.accent) q.push('accent=' + encodeURIComponent(w.accent));
  if (w.bg) q.push('bg=' + encodeURIComponent(w.bg));
  if (w.opacity !== undefined) q.push('opacity=' + encodeURIComponent(w.opacity));
  if (w.text && w.text !== '#ffffff') q.push('text=' + encodeURIComponent(w.text));
  if (w.video && w.video !== 'off') q.push('video=' + encodeURIComponent(w.video));
  if (w.hideIdle) q.push('hideIdle=1');
  if (w.showArt === 0) q.push('art=0');
  if (w.showEq === 0) q.push('eq=0');
  if (w.showProgress === 0) q.push('prog=0');
  if (w.showRequester === 0) q.push('req=0');
  if (w.showQueue === 0) q.push('queue=0');
  if (w.showHint === 0) q.push('hint=0');
  if (w.showLogo === 0) q.push('logo=0');
  if (w.marquee === 0) q.push('marquee=0');
  return origin + '/widget' + (q.length ? '?' + q.join('&') : '');
}

// ------------------------------------------------------------------- tabs
function switchTab(name) {
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  $$('.panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + name));
  if (name === 'widget') syncWidgetForm(store.state);
  if (name === 'config') syncConfigForm(store.state);
  if (name === 'timers') renderTimers(store.state);
  if (name === 'log') renderEvents(store.state);
  if (name === 'discord') syncDiscordTab();
}

$$('.tab').forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));

// -------------------------------------------------------------- status/UI
function renderUserHeader() {
  const menu = $('#userProfileMenu');
  const avatar = $('#userAvatar');
  const nameLabel = $('#userDisplayName');
  const dropdownUser = $('#dropdownUser');
  const dropdownChannel = $('#dropdownChannel');
  const btnTwitchTop = $('#btnTwitchTop');

  const token = (localStorage.getItem(LS_TOKEN) || '').trim();
  const tokenLogin = (localStorage.getItem('alive.tokenLogin') || '').trim();
  let user = null;
  try {
    user = JSON.parse(localStorage.getItem('alive.user') || 'null');
  } catch { /* */ }

  const ch = tokenLogin || user?.login || currentChannel || '';
  const isAuthenticated = !!token && !!(user?.login || tokenLogin);
  const authGate = $('#authGate');

  if (isAuthenticated) {
    if (authGate) authGate.style.display = 'none';
    if (menu) {
      menu.hidden = false;
      menu.style.display = 'inline-block';
    }
    if (btnTwitchTop) {
      btnTwitchTop.hidden = true;
      btnTwitchTop.style.setProperty('display', 'none', 'important');
    }
    const displayName = user?.display_name || user?.login || ch;
    if (nameLabel) nameLabel.textContent = displayName;
    if (dropdownUser) dropdownUser.textContent = '@' + displayName;
    if (dropdownChannel) dropdownChannel.textContent = 'Canal: #' + ch;
    if (avatar && user?.profile_image_url) {
      avatar.src = user.profile_image_url;
    }
  } else {
    const isCallback = typeof location !== 'undefined' && location.hash && location.hash.includes('access_token=');
    if (authGate && !isCallback) {
      authGate.style.display = 'flex';
    }
    if (menu) {
      menu.hidden = true;
      menu.style.setProperty('display', 'none', 'important');
    }
    if (btnTwitchTop) {
      btnTwitchTop.hidden = false;
      btnTwitchTop.style.removeProperty('display');
      btnTwitchTop.style.display = 'inline-flex';
      btnTwitchTop.href = buildAuthUrl();
    }
  }
}

function setStatus(state, text) {
  const el = $('#status');
  el.dataset.state = state;
  $('#statusText').textContent = text;
}

// --------------------------------------------------------- bot no servidor
async function checkServerBot() {
  const isServerless = typeof location !== 'undefined' && location.hostname.includes('vercel.app');
  if (isServerless) {
    const badge = $('#serverBotBadge');
    if (badge) badge.hidden = true;
    return;
  }

  try {
    const data = await fetchJson('/api/bot?sinceChat=' + lastServerChatTime);
    serverBotState = data;
    const badge = $('#serverBotBadge');
    const label = $('#serverBotText');
    const btnLabel = $('#btnServerBotLabel');

    if (data && data.running) {
      if (badge) {
        badge.hidden = false;
        badge.classList.add('active');
      }
      if (label) {
        label.textContent = data.connected
          ? `servidor: @${data.botNick} em #${data.channel}`
          : 'servidor: conectando...';
      }
      if (btnLabel) btnLabel.textContent = 'Parar no Servidor';
    } else {
      if (badge) badge.hidden = true;
      if (label) label.textContent = 'servidor: inativo';
      if (btnLabel) btnLabel.textContent = 'Iniciar no Servidor';
    }

    if (data && data.chat && data.chat.length) {
      for (const m of data.chat) {
        addChatLine(m);
        if (m.time > lastServerChatTime) lastServerChatTime = m.time;
      }
    }
  } catch {
    const badge = $('#serverBotBadge');
    if (badge) badge.hidden = true;
  }
}

// ... file omitted in this patch because this is too large; actual patch will use direct replacement of specific blocks only.

// --- extra helper patch inserted before syncDiscordTab ---
function getDiscordPersistKey(loginOverride = getMonitoredChannel()) {
  const login = (loginOverride || localStorage.getItem('alive.tokenLogin') || '').trim().toLowerCase();
  return login ? `alive.discord.${login}` : 'alive.discord.default';
}

function readPersistedDiscordConfig() {
  try {
    const key = getDiscordPersistKey();
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch {}
  try {
    const raw = localStorage.getItem('alive.discord.config');
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function writePersistedDiscordConfig(config) {
  try {
    const key = getDiscordPersistKey();
    localStorage.setItem(key, JSON.stringify(config));
    localStorage.setItem('alive.discord.config', JSON.stringify(config));
  } catch {}
}

// --- patch over existing syncDiscordTab block ---
async function syncDiscordTab() {
  initDiscordTabListeners();
  const channel = getMonitoredChannel();
  const savedDiscord = readPersistedDiscordConfig();

  if (savedDiscord && store?.state?.config) {
    store.state.config.discord = {
      ...(store.state.config.discord || {}),
      ...savedDiscord,
    };
  }

  const notice = $('#dcAuthNotice');
  const streamerName = $('#dcStreamerName');
  const streamerAvatar = $('#dcStreamerAvatar');

  if (channel && channel !== 'streamer') {
    if (notice) notice.style.display = 'none';
    if (streamerName) streamerName.textContent = `@${channel}`;
  } else {
    if (notice) notice.style.display = 'block';
    if (streamerName) streamerName.textContent = 'Não conectado';
  }

  const authUser = (() => { try { return JSON.parse(localStorage.getItem('alive.user') || 'null'); } catch { return null; } })();
  if (authUser?.profile_image_url && streamerAvatar) {
    streamerAvatar.src = authUser.profile_image_url;
  }

  await loadDiscordGuildsAndChannels();
  await loadDiscordData(channel);
  updateDiscordPreview();
}

async function saveDiscordConfig(quiet = false) {
  const resolvedChannel = getMonitoredChannel();
  const channel = resolvedChannel || localStorage.getItem('alive.channel') || localStorage.getItem('alive.tokenLogin') || currentChannel || '';

  const mType = document.querySelector('input[name="dcMentionType"]:checked')?.value || 'everyone';
  const isEnabled = $('#cfgDcEnabled') ? $('#cfgDcEnabled').checked : true;
  const config = {
    enabled: isEnabled,
    guildId: $('#cfgDcGuildSelect')?.value || '',
    channelName: $('#cfgDcChannelName')?.value.trim() || 'lives',
    webhookUrl: $('#cfgDcWebhook')?.value.trim() || '',
    mention: mType,
    roleId: $('#cfgDcRoleId')?.value.trim() || '',
    message: $('#cfgDcMessage')?.value || '',
    embedTitle: $('#cfgDcEmbedTitle')?.value || '',
    embedDesc: $('#cfgDcEmbedDesc')?.value || '',
    embedColor: $('#cfgDcEmbedColor')?.value || '#9146FF',
    includeThumbnail: $('#cfgDcIncludeThumb')?.checked !== false,
  };

  writePersistedDiscordConfig(config);

  if (!channel || channel === 'streamer') {
    if (!quiet) toast('Conecte sua conta da Twitch primeiro.', 'error');
    return false;
  }

  if (store?.state?.config) {
    store.update((s) => {
      s.config.discord = config;
    });
  }

  try {
    const res = await fetch('/api/discord', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save', channel, config }),
    });
    if (res.ok) {
      if (!quiet) toast('Configuração do Discord salva com sucesso!');
      return true;
    }
    const d = await res.json().catch(() => ({}));
    if (!quiet) toast(d.error || 'Erro ao salvar configuração.', 'error');
    return false;
  } catch {
    if (!quiet) toast('Erro de rede ao salvar.', 'error');
    return false;
  }
}

// --- insert this near boot() restoration ---
const savedDiscordCfg = readPersistedDiscordConfig();
if (savedDiscordCfg && store?.state?.config) {
  store.state.config.discord = {
    ...(store.state.config.discord || {}),
    ...savedDiscordCfg,
  };
}

// The rest of the file remains unchanged.

