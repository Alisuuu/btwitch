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
let curPlayingStartedAt = 0;
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
      curPlayingStartedAt = 0;
      try { panelPlayer?.stopVideo?.(); } catch { /* */ }
    }
    return;
  }

  const vol = Number(s.volume ?? 70);
  const start = Math.max(0, Math.round(now.position || 0));
  const nowStartedAt = now.startedAt || 0;

  if (curPlayingId !== now.id || curPlayingStartedAt !== nowStartedAt) {
    curPlayingId = now.id;
    curPlayingStartedAt = nowStartedAt;
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

  // Atualização de volume e estado de pause
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
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function widgetUrl() {
  const origin = (typeof window !== 'undefined' && window.location && window.location.origin)
    ? window.location.origin.replace(/\/$/, '')
    : (typeof location !== 'undefined' && location.origin ? location.origin.replace(/\/$/, '') : '');
  const w = store?.state?.config?.widget || {};
  const q = [];
  const ch = currentChannel || store?.state?.config?.channel || (typeof localStorage !== 'undefined' ? (localStorage.getItem('alive.channel') || localStorage.getItem('alive.tokenLogin') || '') : '');
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
function updateTabsScrollIndicators() {
  const wrapper = $('#tabsScrollWrapper');
  const nav = $('#tabsNav');
  if (!wrapper || !nav) return;
  const scrollLeft = nav.scrollLeft;
  const maxScroll = nav.scrollWidth - nav.clientWidth;
  const hasOverflow = maxScroll > 4;

  wrapper.classList.toggle('can-scroll-left', hasOverflow && scrollLeft > 4);
  wrapper.classList.toggle('can-scroll-right', hasOverflow && (maxScroll - scrollLeft) > 4);
}

function initTabsScroll() {
  const wrapper = $('#tabsScrollWrapper');
  const nav = $('#tabsNav');
  const btnLeft = $('#tabsScrollLeft');
  const btnRight = $('#tabsScrollRight');
  if (!wrapper || !nav) return;

  nav.addEventListener('scroll', updateTabsScrollIndicators, { passive: true });
  window.addEventListener('resize', updateTabsScrollIndicators);

  if (btnLeft) {
    btnLeft.addEventListener('click', (e) => {
      e.preventDefault();
      nav.scrollBy({ left: -180, behavior: 'smooth' });
    });
  }
  if (btnRight) {
    btnRight.addEventListener('click', (e) => {
      e.preventDefault();
      nav.scrollBy({ left: 180, behavior: 'smooth' });
    });
  }

  updateTabsScrollIndicators();
  setTimeout(updateTabsScrollIndicators, 200);
  setTimeout(updateTabsScrollIndicators, 600);
}

function switchTab(name) {
  $$('.tab').forEach((t) => {
    const isActive = t.dataset.tab === name;
    t.classList.toggle('active', isActive);
    if (isActive) {
      try {
        t.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      } catch { /* */ }
    }
  });
  $$('.panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + name));
  if (name === 'widget') syncWidgetForm(store.state);
  if (name === 'config') syncConfigForm(store.state);
  if (name === 'ia') syncIaTab(store.state);
  if (name === 'timers') renderTimers(store.state);
  if (name === 'log') renderEvents(store.state);
  if (name === 'discord') syncDiscordTab();

  setTimeout(updateTabsScrollIndicators, 120);
}

$$('.tab').forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));
initTabsScroll();

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
    // Bloqueio de segurança em guia anônima / deslogado
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

async function toggleServerBot() {
  const btn = $('#btnServerBotToggle');
  btn.disabled = true;
  try {
    const token = (localStorage.getItem(LS_TOKEN) || store.state.config.botToken || '').trim();
    if (token && !localStorage.getItem(LS_TOKEN)) {
      localStorage.setItem(LS_TOKEN, token);
    }
    const channel = $('#cfgChannel').value.trim().toLowerCase() || store.state.config.channel;
    const nick = $('#cfgNick').value.trim().toLowerCase() || store.state.config.botNick;

    if (!channel) {
      toast('Informe o canal antes de iniciar.');
      switchTab('config');
      $('#cfgChannel').focus();
      return;
    }

    const action = serverBotState.running ? 'stop' : 'start';
    const res = await fetchJson('/api/bot', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, channel, nick, token }),
    });

    if (res.ok) {
      toast(action === 'start' ? 'Bot iniciado no servidor Node.' : 'Bot do servidor parado.');
      await checkServerBot();
    }
  } catch (e) {
    toast('Erro no bot do servidor: ' + e.message);
  } finally {
    btn.disabled = false;
  }
}

// ------------------------------------------------------------- chat & log
function addChatLine(m) {
  chatLines.push(m);
  if (chatLines.length > 300) chatLines.shift();
  const box = $('#chatList');
  if (!box) return;
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;

  const cls = ['msg'];
  if (m.text.trim().startsWith('!')) cls.push('command');
  if (m.self) cls.push('self');

  const whoCls = ['who'];
  if (m.broadcaster) whoCls.push('streamer');
  else if (m.mod) whoCls.push('mod');
  else if (m.badges?.vip) whoCls.push('vip');

  const d = m.time ? new Date(m.time) : new Date();
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  const div = document.createElement('div');
  div.className = cls.join(' ');
  div.innerHTML =
    `<span class="time">${time}</span>` +
    `<span class="${whoCls.join(' ')}">${esc(m.displayName)}</span>` +
    `<span>: ${esc(m.text)}</span>`;
  box.appendChild(div);

  while (box.children.length > 300) box.firstChild.remove();
  if (nearBottom) box.scrollTop = box.scrollHeight;
}

function renderEvents(s) {
  const box = $('#eventList');
  if (!box) return;
  if (!s.log.length) {
    box.innerHTML = '<div class="empty">Nenhum evento registrado.</div>';
  } else {
    box.innerHTML = s.log.map((e) => {
      const d = new Date(e.t);
      const t = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      return `<div class="event"><span class="k">${esc(e.type)}</span><span><b>${t}</b> ${esc(e.text)}</span></div>`;
    }).join('');
  }
  const syncInfo = $('#syncInfo');
  if (syncInfo) {
    syncInfo.textContent = `rev ${s.rev} · sincronizado às ${new Date(s.updatedAt).toLocaleTimeString()}`;
  }
}

// ------------------------------------------------------- conexão + runner
function buildAuthUrl(clientId) {
  let cid = (clientId || (typeof localStorage !== 'undefined' ? localStorage.getItem(LS_CLIENT) : '') || '04ajnvlju5loqchkmzfl7v622veib6').trim();
  if (cid === 'gp762nuuoqcoxypju8c569th9wz7q5' || !cid) {
    cid = '04ajnvlju5loqchkmzfl7v622veib6';
    try { localStorage.setItem(LS_CLIENT, cid); } catch {}
  }
  const origin = window.location.origin || (window.location.protocol + '//' + window.location.host);
  const redirect = origin.replace(/\/$/, '') + '/oauth.html';
  return 'https://id.twitch.tv/oauth2/authorize' +
    `?client_id=${encodeURIComponent(cid)}` +
    `&redirect_uri=${encodeURIComponent(redirect)}` +
    '&response_type=token' +
    `&scope=${encodeURIComponent('chat:read chat:edit')}` +
    '&force_verify=true';
}
window.buildAuthUrl = buildAuthUrl;

async function checkAuthCallback() {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(location.search);
  const token = (hash.get('access_token') || query.get('access_token') || '').replace(/^oauth:/i, '').trim();
  const error = hash.get('error') || query.get('error');

  if (error) {
    console.warn('[alive] Twitch OAuth erro:', error, query.get('error_description') || hash.get('error_description'));
    if (error === 'redirect_mismatch') {
      const curOrigin = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin.replace(/\/$/, '') : 'https://alive-bot-j126.onrender.com';
      toast(`Redirect URI não bate com a Twitch. Cadastre ${curOrigin}/oauth.html no console.`, 6000);
    } else {
      toast(`Erro Twitch: ${error}`, 4000);
    }
    history.replaceState(null, '', location.pathname);
    return;
  }

  if (token) {
    localStorage.setItem(LS_TOKEN, token);
    localStorage.removeItem('alive.tokenLogin');
    localStorage.removeItem('alive.user');
    toast('Identificando sua conta Twitch...', 3000);

    const clientId = localStorage.getItem(LS_CLIENT) || '04ajnvlju5loqchkmzfl7v622veib6';
    const login = await resolveBotNick(token, clientId, false);
    if (login) {
      // O canal do painel é EXCLUSIVAMENTE o canal do streamer autenticado
      const targetChannel = login;
      currentChannel = targetChannel;
      localStorage.setItem('alive.channel', targetChannel);
      localStorage.setItem('alive.tokenLogin', login);
      store.setChannel(targetChannel);
      store.update((s) => {
        s.config.channel = targetChannel;
      });
      toast(`Bem-vindo, @${login}! Painel conectado com segurança.`, 5000);
      history.replaceState(null, '', location.pathname);

      const authGate = $('#authGate');
      if (authGate) authGate.style.display = 'none';

      fetch('/api/bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', channel: targetChannel, nick: login, token })
      }).catch(() => {});

      connect().catch(console.error);
    } else {
      history.replaceState(null, '', location.pathname);
    }
    renderUserHeader();
  }
}

async function resolveBotNick(token, clientId, useCache = true) {
  if (!token) return '';
  const cleanToken = token.replace(/^oauth:/i, '').trim();

  if (useCache) {
    let cachedUser = null;
    try { cachedUser = JSON.parse(localStorage.getItem('alive.user') || 'null'); } catch {}
    if (cachedUser?.login && cachedUser?.profile_image_url) return cachedUser.login;
  }

  let login = '';
  let userId = '';
  let resolvedClientId = clientId || localStorage.getItem(LS_CLIENT) || '04ajnvlju5loqchkmzfl7v622veib6';
  let profileImg = '';
  let displayName = '';

  // 1. Valida direto com a Twitch (https://id.twitch.tv/oauth2/validate) — instantâneo, CORS habilitado
  try {
    const r = await fetch('https://id.twitch.tv/oauth2/validate', {
      headers: { authorization: 'OAuth ' + cleanToken },
    });
    if (r.ok) {
      const v = await r.json();
      if (v && v.login) {
        login = String(v.login).toLowerCase();
        userId = v.user_id || login;
        displayName = login;
        if (v.client_id) resolvedClientId = v.client_id;
      }
    } else if (r.status === 401) {
      console.warn('[alive] Token da Twitch expirado ou revogado (401).');
      localStorage.removeItem(LS_TOKEN);
      localStorage.removeItem('alive.tokenLogin');
    }
  } catch (e) {
    console.warn('[alive] direct twitch validate:', e.message);
  }

  // 2. Busca dados completos na Helix (avatar e display_name)
  if (resolvedClientId) {
    try {
      const hr = await fetch('https://api.twitch.tv/helix/users' + (login ? `?login=${encodeURIComponent(login)}` : ''), {
        headers: {
          'authorization': 'Bearer ' + cleanToken,
          'client-id': resolvedClientId,
        },
      });
      if (hr.ok) {
        const hj = await hr.json();
        const u = hj?.data?.[0];
        if (u) {
          login = u.login || login;
          userId = u.id || userId;
          displayName = u.display_name || login;
          profileImg = u.profile_image_url || '';
        }
      }
    } catch (err) {
      console.warn('[alive] direct helix users:', err.message);
    }
  }

  // 3. Fallback via backend /api/twitch
  if (!profileImg && resolvedClientId) {
    try {
      const ctrl = new AbortController();
      const tId = setTimeout(() => ctrl.abort(), 4000);
      const j = await fetchJson('/api/twitch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: cleanToken, clientId: resolvedClientId }),
        signal: ctrl.signal,
      }).finally(() => clearTimeout(tId));
      if (j && j.login) {
        login = j.login || login;
        displayName = j.display_name || displayName || login;
        userId = j.id || userId;
        profileImg = j.profile_image_url || '';
      }
    } catch (e) {
      console.warn('[alive] backend twitch api:', e.message);
    }
  }

  if (login) {
    const userObj = {
      login,
      display_name: displayName || login,
      id: userId || login,
      profile_image_url: profileImg || '',
    };
    localStorage.setItem('alive.tokenLogin', login);
    localStorage.setItem('alive.channel', login);
    localStorage.setItem('alive.user', JSON.stringify(userObj));
    renderUserHeader();
    return login;
  }

  return '';
}

const OFFICIAL_BOT_NICK = 'alivebot1';
const OFFICIAL_BOT_TOKEN = 'te78do9otbn9t5ia4lxzr3div72dvg';
const OFFICIAL_CLIENT_ID = '04ajnvlju5loqchkmzfl7v622veib6';

async function loginWithToken(rawToken) {
  const token = (rawToken || '').replace(/^oauth:/i, '').trim();
  if (!token) {
    toast('Insira o token da sua conta Twitch.', 'error');
    return;
  }
  toast('Identificando sua conta na Twitch...', 3000);
  try {
    const res = await fetch('https://id.twitch.tv/oauth2/validate', {
      headers: { Authorization: `OAuth ${token}` },
    });
    if (!res.ok) {
      toast('Token da Twitch inválido ou expirado.', 'error');
      return;
    }
    const val = await res.json();
    if (!val || !val.login) {
      toast('Não foi possível identificar sua conta na Twitch.', 'error');
      return;
    }
    const login = String(val.login).toLowerCase();
    localStorage.setItem(LS_TOKEN, token);
    localStorage.setItem('alive.tokenLogin', login);
    localStorage.setItem('alive.channel', login);

    let userObj = { login, display_name: val.login, id: val.user_id };
    try {
      const uRes = await fetch(`/api/twitch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, clientId: val.client_id || OFFICIAL_CLIENT_ID }),
      }).then((r) => r.json());
      if (uRes && uRes.login) userObj = uRes;
    } catch {}

    localStorage.setItem('alive.user', JSON.stringify(userObj));
    currentChannel = login;
    store.setChannel(login);
    store.update((s) => { s.config.channel = login; });

    const authGate = $('#authGate');
    if (authGate) authGate.style.display = 'none';

    renderUserHeader();
    toast(`Bem-vindo, @${userObj.display_name || login}! Painel conectado.`, 5000);
    connect().catch(console.error);

    fetch('/api/bot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start', channel: login }),
    }).catch(() => {});
  } catch (err) {
    toast(`Erro ao autenticar: ${err.message}`, 'error');
  }
}
window.loginWithToken = loginWithToken;

function send(text) {
  if (irc && irc.connected && !irc.readOnly) {
    const ok = irc.send(text);
    if (ok) return true;
  }
  const channel = currentChannel || store?.state?.config?.channel || '';
  if (channel) {
    fetch('/api/bot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'send', channel, text }),
    }).catch(() => {});
    return true;
  }
  return false;
}

let connectingLock = false;

async function connect() {
  if (connectingLock) return;
  connectingLock = true;
  try {
    // Usa as credenciais oficiais da conta @alivebot1 por padrão para responder em qualquer canal
    const token = (localStorage.getItem(LS_TOKEN) || store.state.config.botToken || OFFICIAL_BOT_TOKEN).trim();
    const clientId = (localStorage.getItem(LS_CLIENT) || OFFICIAL_CLIENT_ID).trim();

    let channel = (
      currentChannel ||
      localStorage.getItem('alive.channel') ||
      localStorage.getItem('alive.tokenLogin') ||
      (()=>{ try { return JSON.parse(localStorage.getItem('alive.user') || '{}')?.login; } catch { return ''; } })() ||
      store.state.config.channel ||
      ''
    ).trim().toLowerCase().replace(/^#/, '').replace(/^https?:\/\/(www\.)?twitch\.tv\//i, '').replace(/[^a-z0-9_]/g, '');

    if (!channel) {
      // Usuário não logado em nenhum canal
      return;
    }

    let nick = OFFICIAL_BOT_NICK;
    if (token && token !== OFFICIAL_BOT_TOKEN) {
      const realOwner = await resolveBotNick(token, clientId, true);
      if (realOwner) nick = realOwner;
    }

    currentChannel = channel;
    localStorage.setItem('alive.channel', channel);

    // Conecta também o backend para redundância e resposta garantida
    fetch('/api/bot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start', channel, nick, token }),
    }).catch(() => {});

    if (irc) {
      const oldIrc = irc;
      irc = null;
      try { oldIrc.close(); } catch { /* */ }
    }

    store.setChannel(channel);
    store.update((s) => {
      s.config.channel = channel;
      s.config.botNick = nick || '';
    });

    const instance = new TwitchIRC({ channel, nick, token });
    irc = instance;

    instance.addEventListener('status', (e) => {
      if (irc !== instance) return;
      const d = e.detail;
      if (d.state === 'connecting') {
        setStatus('connecting', 'conectando ao chat...');
      } else if (d.state === 'connected') {
        setStatus(d.readOnly ? 'readonly' : 'on',
          d.readOnly ? `lendo #${d.channel} (modo leitura)` : `@${d.nick} em #${d.channel}`);
        addChatLine({
          login: 'sistema',
          displayName: '⚡ Bot Twitch',
          text: d.readOnly
            ? `Conectado ao canal #${d.channel} em modo leitura! Comandos (!play, !skip) ativos.`
            : `Conectado ao canal #${d.channel} como @${d.nick}! Bot pronto e online.`,
          self: false,
          color: '#34d399',
          badges: {}
        });
        toast(d.readOnly ? `Conectado em #${d.channel} (modo leitura)` : `Bot conectado em #${d.channel}!`, 3500);
      } else if (d.state === 'reconnecting') {
        setStatus('reconnecting', d.message || 'reconectando...');
      } else if (d.state === 'error') {
        setStatus('error', d.message || 'erro de conexão');
      } else if (d.state === 'closed') {
        setStatus('off', 'desconectado');
      }
    });

    instance.addEventListener('auth_fallback', (e) => {
      if (irc !== instance) return;
      toast('Login da Twitch expirado. Conectamos em modo leitura para manter seu chat e músicas funcionando!', 6000);
    });

    instance.addEventListener('message', (e) => {
      if (irc !== instance) return;
      const msg = e.detail;
      addChatLine(msg);
      if (!msg.isEcho) {
        chatMessagesCount++;
      }
      if (!msg.isEcho && runner) {
        runnerBusy = true;
        Promise.resolve()
          .then(() => runner(msg))
          .catch((err) => console.error('[alive] comando:', err))
          .finally(() => { runnerBusy = false; });
      }
    });

    instance.addEventListener('notice', (e) => {
      if (irc !== instance) return;
      const t = e.detail?.text || '';
      const msgId = e.detail?.msgId || '';
      addChatLine({
        login: 'twitch',
        displayName: '⚠️ Twitch',
        text: `Aviso do chat: ${t}`,
        self: false,
        color: '#f59e0b',
        badges: {}
      });
      if (/rate_limit|slow_mode|followersonly|subsonly/i.test(msgId + t)) {
        toast(`Aviso Twitch: ${t}`, 4500);
      }
    });

    instance.addEventListener('raw_log', (e) => {
      if (irc !== instance) return;
      const { direction, line } = e.detail || {};
      if (direction === 'error' || direction === 'close' || /001|NOTICE|JOIN|Welcome|authentication failed/i.test(line)) {
        addChatLine({
          login: 'sistema',
          displayName: direction === 'error' ? '⚠️ IRC' : (direction === 'close' ? 'ℹ️ IRC' : '📡 Twitch'),
          text: line,
          self: false,
          color: direction === 'error' ? '#f87171' : '#a78bfa',
          badges: {}
        });
      }
    });

    instance.connect();
  } finally {
    connectingLock = false;
  }
}

function disconnect(showToast = true) {
  if (irc) {
    irc.close();
    irc = null;
  }
  setStatus('off', 'desconectado');
  if (showToast) toast('Bot local desconectado.');
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && currentChannel) {
      const now = Date.now();
      const isDead = !irc || !irc.ws || irc.ws.readyState !== 1 || (irc._lastActivity && now - irc._lastActivity > 45000);
      if (isDead) {
        console.log('[alive] aba ativa: socket inativo ou desconectado (>45s), reconectando IRC...');
        connect();
      }
    }
  });
  window.addEventListener('online', () => {
    console.log('[alive] rede restaurada: reconectando IRC...');
    connect();
  });
}

// ------------------------------------------------------------ fila (UI)
let posCache = { id: null, pos: 0, at: 0 };

function renderNow(s) {
  const now = s.now;
  const card = $('#nowCard');
  card.classList.toggle('paused', !!now?.paused);

  const pauseBtn = $('#btnPause');
  if (pauseBtn) {
    pauseBtn.innerHTML = now?.paused
      ? icon('play', { size: 18 })
      : icon('pause', { size: 18 });
  }

  if (!now) {
    $('#nowThumb').removeAttribute('src');
    $('#nowKicker').textContent = 'SEM MÚSICA';
    $('#nowTitle').textContent = 'Nada tocando';
    $('#nowSub').textContent = 'Peça uma música com !play no chat ou use a busca';
    $('#nowFill').style.width = '0%';
    $('#nowCur').textContent = '0:00';
    $('#nowDur').textContent = '0:00';
    posCache = { id: null, pos: 0, at: 0 };
    return;
  }

  const thumb = now.thumb || thumbFor(now.id);
  if ($('#nowThumb').getAttribute('src') !== thumb) $('#nowThumb').src = thumb;
  $('#nowKicker').textContent = now.paused ? 'PAUSADO' : 'TOCANDO AGORA';
  $('#nowTitle').textContent = now.title;
  $('#nowSub').textContent = [now.channel, now.requestedBy ? 'pedido por ' + now.requestedBy : '']
    .filter(Boolean).join(' · ');

  if (posCache.id !== now.id || posCache.pos !== now.position) {
    posCache = { id: now.id, pos: now.position || 0, at: Date.now() };
  }
}

function tickNow() {
  const s = store.state;
  const now = s.now;
  if (!now) return;

  let cur = 0;
  if (ytApiReady && panelPlayer && typeof panelPlayer.getCurrentTime === 'function' && curPlayingId === now.id) {
    try {
      cur = panelPlayer.getCurrentTime() || 0;
      if (!now.paused && Math.abs((now.position || 0) - cur) >= 4) {
        now.position = Math.round(cur);
      }
    } catch {
      cur = posCache.pos;
    }
  } else {
    if (!now.paused && posCache.id === now.id) {
      cur = Math.min(now.duration || Infinity, posCache.pos + (Date.now() - posCache.at) / 1000);
    } else {
      cur = posCache.pos;
    }
  }

  const dur = now.duration || 0;
  $('#nowFill').style.width = (dur > 0 ? Math.min(100, (cur / dur) * 100) : 0).toFixed(2) + '%';
  $('#nowCur').textContent = fmtTime(cur);
  $('#nowDur').textContent = fmtTime(dur);
}

let queueSig = '';
function renderQueue(s) {
  const sig = s.queue.map((x) => x.id + '|' + x.requestedBy + '|' + x.title).join('§');
  if (sig === queueSig) return;
  queueSig = sig;

  $('#queueCount').textContent = String(s.queue.length);
  const list = $('#queueList');
  if (!s.queue.length) {
    list.innerHTML = '<li class="empty">Fila vazia — envie !play no chat ou adicione pela busca.</li>';
    return;
  }
  list.innerHTML = s.queue.map((x, i) => `
    <li>
      <span class="q-pos">${i + 1}</span>
      <img class="q-thumb" src="${esc(x.thumb || thumbFor(x.id))}" alt="" loading="lazy">
      <div class="q-main">
        <div class="q-title">${esc(x.title)}</div>
        <div class="q-sub">${esc(x.channel || '')} · pedido por <b>${esc(x.requestedBy)}</b>${x.duration ? ' · ' + fmtTime(x.duration) : ''}</div>
      </div>
      <div class="q-acts">
        <button data-act="up" data-i="${i}" title="Subir">${icon('chevron-up', { size: 13 })}</button>
        <button data-act="down" data-i="${i}" title="Descer">${icon('chevron-down', { size: 13 })}</button>
        <button class="del" data-act="del" data-i="${i}" title="Remover">${icon('trash-2', { size: 12 })}</button>
      </div>
    </li>`).join('');
  renderHistory(s);
}

function renderHistory(s) {
  const el = $('#historyList');
  if (!el) return;
  const hist = s.history || [];
  if (!hist.length) {
    el.innerHTML = '<li class="empty">Nenhuma música tocada ainda nesta sessão.</li>';
    return;
  }
  el.innerHTML = hist.slice(-8).reverse().map((x, idx) => `
    <li>
      <img class="q-thumb" src="${esc(x.thumb || thumbFor(x.id))}" alt="" loading="lazy">
      <div class="q-main">
        <div class="q-title">${esc(x.title)}</div>
        <div class="q-sub">${esc(x.channel || '')} · pedido por <b>${esc(x.requestedBy)}</b></div>
      </div>
      <div class="q-acts">
        <button class="btn ghost small" data-readd="${idx}" title="Tocar novamente">${icon('plus', { size: 12 })}</button>
      </div>
    </li>`).join('');
}

$('#historyList')?.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-readd]');
  if (!btn) return;
  const idx = Number(btn.dataset.readd);
  const hist = (store.state.history || []).slice(-8).reverse();
  const item = hist[idx];
  if (item) {
    addToQueue({ ...item, position: 0 });
    toast(`Música re-adicionada à fila: ${item.title}`);
  }
});

$('#queueList').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const i = Number(btn.dataset.i);
  const act = btn.dataset.act;
  store.update((s) => {
    if (act === 'del') {
      const rm = s.queue.splice(i, 1)[0];
      if (rm) pushLog(s, 'remove', `Removido da fila: ${short(rm.title, 40)}`);
    } else if (act === 'up' && i > 0) {
      [s.queue[i - 1], s.queue[i]] = [s.queue[i], s.queue[i - 1]];
    } else if (act === 'down' && i < s.queue.length - 1) {
      [s.queue[i + 1], s.queue[i]] = [s.queue[i], s.queue[i + 1]];
    }
  });
});

// ------------------------------------------------------------- controles
$('#btnPause').addEventListener('click', () => {
  markUserInteracted();
  if (!store.state.now) return toast('Nada tocando.');
  store.update((s) => {
    if (s.now) {
      s.now.paused = !s.now.paused;
      if (s.now.paused) {
        try { panelPlayer?.pauseVideo?.(); } catch { /* */ }
      } else {
        try { panelPlayer?.unMute?.(); panelPlayer?.playVideo?.(); } catch { /* */ }
      }
    }
  });
  store.flush();
});

$('#btnSkip').addEventListener('click', () => {
  markUserInteracted();
  if (!store.state.now) return toast('Nada tocando.');
  store.update((s) => advanceQueue(s));
  store.flush();
  toast('Música pulada.');
});

$('#btnStop').addEventListener('click', () => {
  markUserInteracted();
  if (!store.state.now && !store.state.queue.length) return toast('Já está parado.');
  if (!confirm('Deseja parar a reprodução e limpar a fila?')) return;
  try { panelPlayer?.stopVideo?.(); } catch { /* */ }
  curPlayingId = null;
  store.update((s) => {
    s.now = null;
    s.queue = [];
    s.skip = null;
    pushLog(s, 'stop', 'Reprodução interrompida pelo painel');
  });
  store.flush();
  toast('Reprodução parada.');
});

$('#btnShuffle').addEventListener('click', () => {
  if (store.state.queue.length < 2) return toast('Fila insuficiente para sortear.');
  store.update((s) => {
    for (let i = s.queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [s.queue[i], s.queue[j]] = [s.queue[j], s.queue[i]];
    }
    pushLog(s, 'shuffle', 'Fila reordenada');
  });
  store.flush();
  toast('Fila sorteada.');
});

$('#btnClear').addEventListener('click', () => {
  if (!store.state.queue.length) return toast('Fila já está vazia.');
  store.update((s) => { s.queue = []; s.skip = null; pushLog(s, 'clear', 'Fila limpa'); });
  toast('Fila limpa.');
});

$('#btnWebMute')?.addEventListener('click', (e) => {
  e.stopPropagation();
  markUserInteracted();
  webAudioMuted = !webAudioMuted;
  localStorage.setItem('alive.webMuted', webAudioMuted ? '1' : '0');
  updateWebMuteUI();
  toast(webAudioMuted ? 'Áudio da web silenciado (OBS segue tocando).' : 'Áudio da web ativado.');
});

const volRange = $('#volRange');
volRange.addEventListener('input', () => { $('#volLabel').textContent = volRange.value; });
volRange.addEventListener('change', () => {
  markUserInteracted();
  const v = Number(volRange.value);
  try { panelPlayer?.setVolume?.(v); } catch { /* */ }
  store.update((s) => { s.volume = v; });
});

// --------------------------------------------------------------- música
let lastResults = [];

function renderResults(items, note = '') {
  const box = $('#results');
  lastResults = items || [];
  if (!lastResults.length) {
    box.innerHTML = `<p class="hint">${esc(note || 'Nenhum resultado encontrado.')}</p>`;
    return;
  }
  box.innerHTML = lastResults.map((it, i) => `
    <div class="res">
      <img src="${esc(it.thumb || thumbFor(it.id))}" alt="" loading="lazy">
      <div class="m">
        <div class="t">${esc(it.title)}</div>
        <div class="s">${esc(it.channel || '')}${it.duration ? ' · ' + fmtTime(it.duration) : ''}</div>
      </div>
      <button class="btn small primary" data-add="${i}">${icon('plus', { size: 13 })} Adicionar</button>
    </div>`).join('') +
    (note ? `<p class="hint">${esc(note)}</p>` : '');
}

function addToQueue(item, quiet = false) {
  const s = store.state;
  if (s.now?.id === item.id || s.queue.some((x) => x.id === item.id)) {
    if (!quiet) toast('Essa faixa já está na fila.');
    return false;
  }
  if (!s.now && s.queue.length >= s.config.maxQueue) {
    if (!quiet) toast('Limite da fila atingido.');
    return false;
  }

  const ch = currentChannel || store.channel || store.state.config.channel || '';
  if (ch && store.channel !== ch) {
    store.setChannel(ch);
  }

  markUserInteracted();

  let started = false;
  let pos = 0;
  store.update((st) => {
    const entry = { ...item, requestedBy: 'painel', requestedAt: Date.now(), position: 0, paused: false };
    if (!st.now) { st.now = { ...entry, startedAt: Date.now() }; started = true; }
    else { st.queue.push(entry); pos = st.queue.length; }
    st.stats.requested++;
    pushLog(st, 'play', `Adicionado: ${short(item.title, 50)}`);
  });

  store.flush();

  if (!quiet) toast(started ? 'Iniciando reprodução imediata.' : `Adicionado na posição ${pos}.`);
  return true;
}

$('#results').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-add]');
  if (!btn) return;
  const item = lastResults[Number(btn.dataset.add)];
  if (item) addToQueue(item);
});

async function doSearch() {
  const q = $('#searchInput').value.trim();
  if (!q) return;
  const box = $('#searchResultsBox');
  if (box) box.hidden = false;
  renderResults([], 'Pesquisando no YouTube...');
  try {
    const j = await fetchJson('/api/search?q=' + encodeURIComponent(q) + '&limit=12');
    renderResults(j.items || []);
  } catch (e) {
    renderResults([], 'Erro: ' + e.message);
  }
}

$('#btnCloseSearch')?.addEventListener('click', () => {
  const box = $('#searchResultsBox');
  if (box) box.hidden = true;
});

$('#btnSearch').addEventListener('click', doSearch);
$('#searchInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });

$('#btnAddUrl').addEventListener('click', async () => {
  const url = $('#urlInput').value.trim();
  if (!url) return toast('Cole um link do YouTube.');
  $('#btnAddUrl').disabled = true;
  try {
    const max = store.state.config.maxPlaylist;
    const j = await fetchJson('/api/resolve?url=' + encodeURIComponent(url) + '&max=' + max);
    if (j.type === 'video' && j.item) {
      addToQueue(j.item);
      $('#urlInput').value = '';
    } else if (j.type === 'playlist') {
      const items = j.items || [];
      if (!items.length) return toast('Playlist vazia ou indisponível.');
      if (!confirm(`Adicionar ${items.length} músicas desta playlist?`)) return;
      let n = 0;
      for (const it of items) if (addToQueue(it, true)) n++;
      toast(`Adicionadas +${n} músicas.`);
      $('#urlInput').value = '';
    } else if ((j.items || []).length) {
      renderResults(j.items, 'Resultados da pesquisa:');
      switchTab('musica');
    } else {
      toast('Não foi possível identificar o link.');
    }
  } catch (e) {
    toast('Erro: ' + e.message);
  } finally {
    $('#btnAddUrl').disabled = false;
  }
});

// ------------------------------------------------------------- comandos
function permLabel(p) {
  if (p === 'sub') return 'Inscritos (Subs)';
  if (p === 'vip') return 'VIPs e Mods';
  if (p === 'mod') return 'Apenas Mods';
  return 'Todos';
}

let cmdSig = '';
function renderCmds(s) {
  const sig = JSON.stringify(s.config.commands) + '§' + JSON.stringify(s.config.cmdPermissions) + '§' + JSON.stringify(s.config.custom);
  if (sig === cmdSig) return;
  cmdSig = sig;

  const perms = s.config.cmdPermissions || {};

  const tbody = $('#cmdTable tbody');
  if (tbody) {
    tbody.innerHTML = COMMANDS.map((c) => {
      const p = perms[c.id] || c.who || 'all';
      return `
        <tr>
          <td><code>${esc(c.cmd)}</code>${c.aliases.length ? `<div class="hint">${c.aliases.map(esc).join(' ')}</div>` : ''}</td>
          <td>${esc(c.desc)}${c.usage ? `<div class="hint"><code>${esc(c.usage)}</code></div>` : ''}</td>
          <td>
            <select class="cmd-perm-select" data-cmd-perm="${c.id}" title="Quem pode usar ${esc(c.cmd)}">
              <option value="all" ${p === 'all' ? 'selected' : ''}>Todos</option>
              <option value="sub" ${p === 'sub' ? 'selected' : ''}>Inscritos (Subs)</option>
              <option value="vip" ${p === 'vip' ? 'selected' : ''}>VIPs e Mods</option>
              <option value="mod" ${p === 'mod' ? 'selected' : ''}>Apenas Mods</option>
            </select>
          </td>
          <td>
            <label class="switch" title="${s.config.commands[c.id] ? 'Desativar comando' : 'Ativar comando'}">
              <input type="checkbox" data-cmd="${c.id}" ${s.config.commands[c.id] ? 'checked' : ''}>
              <span></span>
            </label>
          </td>
        </tr>
      `;
    }).join('');
  }

  const list = $('#customList');
  if (list) {
    const customs = Object.entries(s.config.custom || {});
    list.innerHTML = customs.length
      ? customs.map(([name, c]) => {
        const p = c.perm || (c.modsOnly ? 'mod' : 'all');
        return `
          <li>
            <span class="cn">!${esc(name)}</span>
            <span class="ct">${esc(c.text)}</span>
            <span class="cm">cd ${Number(c.cd) || 0}s · ${esc(permLabel(p))}</span>
            <button data-edit="${esc(name)}">editar</button>
            <button class="del" data-del="${esc(name)}">${icon('trash-2', { size: 11 })}</button>
          </li>
        `;
      }).join('')
      : '<li class="empty">Nenhum comando personalizado criado.</li>';
  }
}

$('#cmdTable')?.addEventListener('change', (e) => {
  const switchInp = e.target.closest('input[data-cmd]');
  const permSel = e.target.closest('select[data-cmd-perm]');

  if (switchInp) {
    const id = switchInp.dataset.cmd;
    store.update((s) => {
      s.config.commands[id] = switchInp.checked ? 1 : 0;
      pushLog(s, 'cmd', `Comando !${id} ${switchInp.checked ? 'ativado' : 'desativado'}`);
    });
    toast(switchInp.checked ? `Comando !${id} ativado.` : `Comando !${id} desativado.`);
  } else if (permSel) {
    const id = permSel.dataset.cmdPerm;
    const newPerm = permSel.value;
    store.update((s) => {
      s.config.cmdPermissions = s.config.cmdPermissions || {};
      s.config.cmdPermissions[id] = newPerm;
      pushLog(s, 'cmd', `Permissão de !${id} alterada para ${permLabel(newPerm)}`);
    });
    toast(`Permissão de !${id}: ${permLabel(newPerm)}`);
  }
});

$('#customList')?.addEventListener('click', (e) => {
  const del = e.target.closest('button[data-del]');
  const edit = e.target.closest('button[data-edit]');
  if (del) {
    const name = del.dataset.del;
    store.update((s) => { delete s.config.custom[name]; pushLog(s, 'cmd', `Comando !${name} apagado`); });
    toast(`Comando !${name} apagado.`);
  } else if (edit) {
    const name = edit.dataset.edit;
    const c = store.state.config.custom[name];
    editingCmd = name;
    $('#ccName').value = name;
    $('#ccText').value = c.text;
    $('#ccCd').value = Number(c.cd) || 10;
    if ($('#ccPerm')) $('#ccPerm').value = c.perm || (c.modsOnly ? 'mod' : 'all');
    $('#btnAddCmd').textContent = 'Salvar';
    $('#ccText').focus();
  }
});

function saveCustomCmd() {
  const name = $('#ccName').value.trim().toLowerCase().replace(/^!/, '');
  const text = $('#ccText').value.trim();
  if (!/^[a-z0-9_]{2,20}$/.test(name)) return toast('Nome inválido (2-20 letras ou números).');
  if (!text) return toast('Informe a resposta do comando.');

  const permVal = $('#ccPerm')?.value || 'all';

  if (editingCmd && editingCmd !== name) {
    store.update((s) => { delete s.config.custom[editingCmd]; });
  }
  store.update((s) => {
    s.config.custom[name] = {
      text: text.slice(0, 400),
      cd: Math.max(0, Number($('#ccCd').value) || 0),
      perm: permVal,
      modsOnly: permVal === 'mod' ? 1 : 0,
    };
    pushLog(s, 'cmd', `Comando !${name} atualizado`);
  });
  editingCmd = null;
  $('#ccName').value = '';
  $('#ccText').value = '';
  $('#ccCd').value = '10';
  if ($('#ccPerm')) $('#ccPerm').value = 'all';
  $('#btnAddCmd').innerHTML = `${icon('plus', { size: 14 })} Criar comando`;
  toast(`Comando !${name} configurado (${permLabel(permVal)}).`);
}

$('#btnAddCmd').addEventListener('click', saveCustomCmd);
$('#ccText').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveCustomCmd(); });

// ------------------------------------------------------------- temporizadores
let timerSig = '';
let chatMessagesCount = 0;
let editingTimerId = null;

function renderTimers(s) {
  const timers = Object.entries(s.config.timers || {});
  const sig = JSON.stringify(s.config.timers);
  if (sig === timerSig) return;
  timerSig = sig;

  const countEl = $('#timersCount');
  if (countEl) countEl.textContent = String(timers.length);

  const list = $('#timerList');
  if (!list) return;

  if (!timers.length) {
    list.innerHTML = '<div class="empty" style="padding: 24px 16px; text-align: center; color: var(--muted); border: 1px dashed var(--line); border-radius: var(--radius);">Nenhum temporizador configurado. Crie o primeiro ao lado!</div>';
    return;
  }

  list.innerHTML = timers.map(([id, t]) => {
    const isEnabled = t.enabled !== false;
    const intervalMin = Number(t.interval) || 15;
    const minLines = Number(t.minLines || 0);
    const previewText = fillVars(t.message, '@streamer', s);

    return `
      <div class="timer-item ${isEnabled ? '' : 'disabled'}" data-id="${esc(id)}">
        <div class="timer-head">
          <div class="timer-title-wrap">
            <label class="switch" title="${isEnabled ? 'Desativar temporizador' : 'Ativar temporizador'}">
              <input type="checkbox" data-timer-toggle="${esc(id)}" ${isEnabled ? 'checked' : ''}>
              <span></span>
            </label>
            <span class="timer-name">${esc(t.name || id)}</span>
          </div>
          <div class="timer-badges">
            <span class="timer-badge">A cada ${intervalMin} min</span>
            <span class="timer-badge">${minLines > 0 ? `Mín. ${minLines} msgs` : 'Sem mínimo'}</span>
          </div>
        </div>
        <div class="timer-text">${esc(previewText)}</div>
        <div class="timer-actions">
          <button class="btn small ghost" data-timer-test="${esc(id)}" title="Enviar esta mensagem no chat agora">
            ${icon('send', { size: 12 })} Testar
          </button>
          <button class="btn small ghost" data-timer-edit="${esc(id)}" title="Editar este temporizador">
            ${icon('edit', { size: 12 })} Editar
          </button>
          <button class="btn small danger" data-timer-del="${esc(id)}" title="Excluir este temporizador">
            ${icon('trash-2', { size: 12 })}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function resetTimerForm() {
  editingTimerId = null;
  if ($('#timerEditId')) $('#timerEditId').value = '';
  if ($('#timerName')) $('#timerName').value = '';
  if ($('#timerInterval')) $('#timerInterval').value = '15';
  if ($('#timerMinLines')) $('#timerMinLines').value = '2';
  if ($('#timerMessage')) $('#timerMessage').value = '';
  if ($('#btnCancelTimer')) $('#btnCancelTimer').hidden = true;
  if ($('#btnSaveTimerText')) $('#btnSaveTimerText').textContent = 'Criar Temporizador';
  if ($('#timerFormTitle')) $('#timerFormTitle').innerHTML = `${icon('sparkles', { size: 16 })} Criar Novo Temporizador`;
}

function bindTimerEvents() {
  $('#timerList')?.addEventListener('change', (e) => {
    const toggle = e.target.closest('input[data-timer-toggle]');
    if (!toggle) return;
    const id = toggle.dataset.timerToggle;
    store.update((s) => {
      if (s.config.timers && s.config.timers[id]) {
        s.config.timers[id].enabled = toggle.checked;
        pushLog(s, 'timer', `Temporizador "${s.config.timers[id].name}" ${toggle.checked ? 'ativado' : 'desativado'}`);
      }
    });
    toast(toggle.checked ? 'Temporizador ativado.' : 'Temporizador pausado.');
  });

  $('#timerList')?.addEventListener('click', (e) => {
    const testBtn = e.target.closest('button[data-timer-test]');
    const editBtn = e.target.closest('button[data-timer-edit]');
    const delBtn = e.target.closest('button[data-timer-del]');

    if (testBtn) {
      const id = testBtn.dataset.timerTest;
      const t = store.state.config.timers?.[id];
      if (!t) return;
      const text = fillVars(t.message, store.state.config.channel || 'streamer', store.state);
      const ok = send(text);
      if (ok) {
        toast(`Mensagem enviada no chat da live!`);
        pushLog(store.state, 'timer', `Teste do temporizador "${t.name}" disparado`);
      } else {
        toast('O bot precisa estar conectado ao chat para enviar mensagens.');
      }
      return;
    }

    if (editBtn) {
      const id = editBtn.dataset.timerEdit;
      const t = store.state.config.timers?.[id];
      if (!t) return;
      editingTimerId = id;
      $('#timerEditId').value = id;
      $('#timerName').value = t.name || id;
      $('#timerInterval').value = t.interval || 15;
      $('#timerMinLines').value = (t.minLines !== undefined) ? t.minLines : 2;
      $('#timerMessage').value = t.message || '';
      $('#btnCancelTimer').hidden = false;
      $('#btnSaveTimerText').textContent = 'Salvar Alterações';
      $('#timerFormTitle').innerHTML = `${icon('edit', { size: 16 })} Editar Temporizador`;
      $('#timerName').focus();
      return;
    }

    if (delBtn) {
      const id = delBtn.dataset.timerDel;
      const t = store.state.config.timers?.[id];
      if (!t) return;
      if (!confirm(`Deseja excluir o temporizador "${t.name || id}"?`)) return;
      store.update((s) => {
        delete s.config.timers[id];
        pushLog(s, 'timer', `Temporizador "${t.name}" excluído`);
      });
      if (editingTimerId === id) resetTimerForm();
      toast('Temporizador removido.');
    }
  });

  $('#btnCancelTimer')?.addEventListener('click', () => {
    resetTimerForm();
  });

  $('#btnSaveTimer')?.addEventListener('click', () => {
    const name = $('#timerName')?.value.trim();
    const interval = Math.max(1, Math.min(360, Number($('#timerInterval')?.value) || 15));
    const minLines = Math.max(0, Math.min(100, Number($('#timerMinLines')?.value) || 0));
    const message = $('#timerMessage')?.value.trim();

    if (!name) return toast('Informe um nome para o temporizador.');
    if (!message) return toast('Informe a mensagem a ser enviada no chat.');

    const targetId = editingTimerId || ('tm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5));

    store.update((s) => {
      s.config.timers = s.config.timers || {};
      const existing = s.config.timers[targetId] || {};
      s.config.timers[targetId] = {
        name,
        interval,
        minLines,
        message,
        enabled: existing.enabled !== false,
        lastRun: existing.lastRun || 0,
      };
      pushLog(s, 'timer', `Temporizador "${name}" salvo`);
    });

    toast(editingTimerId ? 'Temporizador atualizado!' : 'Novo temporizador criado!');
    resetTimerForm();
  });
}

function tickTimers() {
  const s = store.state;
  if (!s.config.timers) return;
  const now = Date.now();
  let hasUpdate = false;

  for (const [id, t] of Object.entries(s.config.timers)) {
    if (t.enabled === false) continue;
    const intervalMs = Math.max(1, Number(t.interval) || 15) * 60 * 1000;
    const minLines = Number(t.minLines || 0);

    // Se o temporizador acabou de ser inicializado, agenda a partir de agora
    if (!t.lastRun) {
      t.lastRun = now;
      hasUpdate = true;
      continue;
    }

    if (now - t.lastRun >= intervalMs) {
      if (chatMessagesCount >= minLines) {
        const text = fillVars(t.message, s.config.channel || 'streamer', s);
        if (text) {
          const sentOk = send(text);
          if (sentOk) {
            t.lastRun = now;
            chatMessagesCount = 0;
            hasUpdate = true;
            pushLog(s, 'timer', `Temporizador "${t.name}" enviado no chat`);
          }
        }
      }
    }
  }

  if (hasUpdate) {
    store.update((st) => {
      st.config.timers = s.config.timers;
    }, { remote: false });
  }
}

function hexToRgb(hex) {
  if (!hex) return null;
  hex = String(hex).replace(/^#/, '');
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  if (hex.length !== 6) return null;
  const num = parseInt(hex, 16);
  if (isNaN(num)) return null;
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

let previewMode = 'playing'; // 'playing' | 'idle'

function updateLivePreview() {
  const card = $('#previewCard');
  if (!card) return;
  const w = store?.state?.config?.widget || {};
  const accent = w.accent || '#ffffff';
  const bg = w.bg || '#0a0a0c';
  const opacity = (w.opacity !== undefined) ? Number(w.opacity) : 65;
  const textColor = w.text || '#ffffff';
  const layout = w.layout || 'card';
  const theme = w.theme || 'minimal';
  const alpha = Math.max(0, Math.min(100, opacity)) / 100;

  card.dataset.layout = layout;
  card.dataset.theme = theme;
  card.style.setProperty('--accent', accent);
  card.style.setProperty('--text-color', textColor);

  const rgb = hexToRgb(bg) || { r: 10, g: 10, b: 12 };
  if (alpha === 0) {
    card.style.background = 'transparent';
    card.style.borderColor = 'transparent';
    card.style.boxShadow = 'none';
  } else {
    card.style.background = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
    card.style.borderColor = `rgba(255, 255, 255, ${Math.min(0.3, Math.max(0.1, alpha * 0.25))})`;
    card.style.boxShadow = '0 14px 35px rgba(0, 0, 0, 0.5)';
  }

  // Toggles de visibilidade
  const showArt = w.showArt !== 0;
  const showEq = w.showEq !== 0;
  const showProgress = w.showProgress !== 0;
  const showRequester = w.showRequester !== 0;
  const playAudio = w.playAudio !== 0;

  if ($('#prevArt')) $('#prevArt').style.display = showArt ? '' : 'none';
  if ($('#prevEq')) $('#prevEq').style.display = showEq ? '' : 'none';
  if ($('#prevProgress')) $('#prevProgress').style.display = showProgress ? '' : 'none';
  if ($('#prevTimes')) $('#prevTimes').style.display = showProgress ? '' : 'none';
  if ($('#prevSub')) $('#prevSub').style.display = showRequester ? '' : 'none';
  if ($('#prevVolVal')) $('#prevVolVal').textContent = playAudio ? '70' : 'MUDO';

  // Cores dinâmicas na prévia
  if ($('#prevFill')) $('#prevFill').style.background = accent;
  if ($('#prevDot')) {
    $('#prevDot').style.background = accent;
    $('#prevDot').style.boxShadow = `0 0 8px ${accent}`;
  }
  if ($('#prevTitle')) $('#prevTitle').style.color = textColor;

  // Alternar entre tocando e fila vazia
  if (previewMode === 'idle') {
    card.classList.add('idle');
    if ($('#prevThumb')) $('#prevThumb').src = '/img/ic_splash_logo.webp';
    if ($('#prevKicker')) $('#prevKicker').textContent = 'ALIVE BOT · AGUARDANDO';
    if ($('#prevTitle')) $('#prevTitle').textContent = 'Fila vazia';
    if ($('#prevSub')) $('#prevSub').textContent = 'Peça no chat com !play <música>';
    if ($('#prevProgress')) $('#prevProgress').style.display = 'none';
    if ($('#prevTimes')) $('#prevTimes').style.display = 'none';
    if ($('#prevEq')) $('#prevEq').style.display = 'none';
  } else {
    card.classList.remove('idle');
    if ($('#prevThumb')) $('#prevThumb').src = '/img/ic_splash_logo.webp';
    if ($('#prevKicker')) $('#prevKicker').textContent = 'TOCANDO AGORA';
    if ($('#prevTitle')) $('#prevTitle').textContent = 'Synthwave Beats & Lofi Chill';
    if ($('#prevSub')) $('#prevSub').textContent = 'Canal Oficial · pedido por @vip_streamer';
  }
}

// ---------------------------------------------------------------- widget
function syncWidgetForm(s) {
  const w = s.config.widget || {};
  $('#widgetUrl').value = widgetUrl();

  // Sincroniza seletores gráficos
  const curLayout = w.layout || 'card';
  $$('#layoutPicker .visual-choice-card').forEach((b) => {
    b.classList.toggle('active', b.dataset.layout === curLayout);
  });

  const curTheme = w.theme || 'minimal';
  $$('#themePicker .visual-choice-card').forEach((b) => {
    b.classList.toggle('active', b.dataset.theme === curTheme);
  });

  const curAudio = (w.playAudio !== undefined) ? Number(w.playAudio) : 1;
  $$('#audioPicker .audio-choice-btn').forEach((b) => {
    b.classList.toggle('active', Number(b.dataset.audio) === curAudio);
  });

  if ($('#wScale')) $('#wScale').value = w.scale || 100;
  if ($('#wScaleLabel')) $('#wScaleLabel').textContent = (w.scale || 100) + '%';

  // Cores & Opacidade
  const accent = w.accent || '#ffffff';
  const bg = w.bg || '#0a0a0c';
  const opacity = (w.opacity !== undefined) ? Number(w.opacity) : 65;
  const textColor = w.text || '#ffffff';

  if ($('#wAccentColor')) $('#wAccentColor').value = accent;
  if ($('#valAccent')) $('#valAccent').textContent = accent;
  if ($('#wBgColor')) $('#wBgColor').value = bg;
  if ($('#valBg')) $('#valBg').textContent = bg;
  if ($('#wTextColor')) $('#wTextColor').value = textColor;
  if ($('#valText')) $('#valText').textContent = textColor;
  if ($('#wBgOpacity')) $('#wBgOpacity').value = opacity;
  if ($('#valOpacityLabel')) {
    $('#valOpacityLabel').textContent = opacity === 0 ? '0% (100% Transparente)' : `${opacity}% ${opacity === 100 ? '(Sólido)' : '(Translúcido)'}`;
  }

  if ($('#wArt')) $('#wArt').checked = (w.showArt !== 0);
  if ($('#wEq')) $('#wEq').checked = (w.showEq !== 0);
  if ($('#wProgress')) $('#wProgress').checked = (w.showProgress !== 0);
  if ($('#wRequester')) $('#wRequester').checked = (w.showRequester !== 0);
  if ($('#wQueue')) $('#wQueue').checked = (w.showQueue !== 0);
  if ($('#wHint')) $('#wHint').checked = (w.showHint !== 0);
  if ($('#wLogo')) $('#wLogo').checked = (w.showLogo !== 0);
  if ($('#wHideIdle')) $('#wHideIdle').checked = !!w.hideIdle;
  if ($('#wMarquee')) $('#wMarquee').checked = (w.marquee !== 0);

  updateLivePreview();
}

function bindWidgetForm() {
  // 1. Seletor gráfico de formato / layout
  $('#layoutPicker')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-layout]');
    if (!btn) return;
    const val = btn.dataset.layout;
    store.update((s) => {
      s.config.widget = s.config.widget || {};
      s.config.widget.layout = val;
    });
    store.flush();
    syncWidgetForm(store.state);
  });

  // 2. Seletor gráfico de tema base
  $('#themePicker')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-theme]');
    if (!btn) return;
    const val = btn.dataset.theme;
    store.update((s) => {
      s.config.widget = s.config.widget || {};
      s.config.widget.theme = val;
      if (val === 'transparent') {
        s.config.widget.opacity = 0;
      } else if (val === 'minimal') {
        s.config.widget.bg = '#0a0a0c';
        if (!s.config.widget.opacity) s.config.widget.opacity = 65;
      } else if (val === 'slate') {
        s.config.widget.bg = '#18181b';
        if (!s.config.widget.opacity) s.config.widget.opacity = 75;
      } else if (val === 'contrast') {
        s.config.widget.bg = '#000000';
        s.config.widget.opacity = 100;
        s.config.widget.accent = '#ffffff';
      }
    });
    store.flush();
    syncWidgetForm(store.state);
  });

  // 3. Seletor gráfico de áudio
  $('#audioPicker')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-audio]');
    if (!btn) return;
    const val = Number(btn.dataset.audio);
    store.update((s) => {
      s.config.widget = s.config.widget || {};
      s.config.widget.playAudio = val;
    });
    store.flush();
    syncWidgetForm(store.state);
  });

  const map = {
    wAccentColor: ['accent', 'value', (v) => v],
    wBgColor: ['bg', 'value', (v) => v],
    wTextColor: ['text', 'value', (v) => v],
    wArt: ['showArt', 'checked', (v) => v ? 1 : 0],
    wEq: ['showEq', 'checked', (v) => v ? 1 : 0],
    wProgress: ['showProgress', 'checked', (v) => v ? 1 : 0],
    wRequester: ['showRequester', 'checked', (v) => v ? 1 : 0],
    wQueue: ['showQueue', 'checked', (v) => v ? 1 : 0],
    wHint: ['showHint', 'checked', (v) => v ? 1 : 0],
    wLogo: ['showLogo', 'checked', (v) => v ? 1 : 0],
    wHideIdle: ['hideIdle', 'checked', (v) => v ? 1 : 0],
    wMarquee: ['marquee', 'checked', (v) => v ? 1 : 0],
  };

  for (const [id, [key, prop, cast]] of Object.entries(map)) {
    const el = $('#' + id);
    if (!el) continue;
    const ev = (id === 'wAccentColor' || id === 'wBgColor' || id === 'wTextColor') ? 'input' : 'change';
    el.addEventListener(ev, (e) => {
      const raw = e.target[prop];
      const v = cast ? cast(raw) : raw;
      if (id === 'wAccentColor' && $('#valAccent')) $('#valAccent').textContent = v;
      if (id === 'wBgColor' && $('#valBg')) $('#valBg').textContent = v;
      if (id === 'wTextColor' && $('#valText')) $('#valText').textContent = v;

      store.update((s) => {
        s.config.widget = s.config.widget || {};
        s.config.widget[key] = v;
        if (id === 'wBgColor' && s.config.widget.theme === 'transparent') {
          s.config.widget.theme = 'minimal';
          if (!s.config.widget.opacity) s.config.widget.opacity = 75;
        }
      });
      $('#widgetUrl').value = widgetUrl();
      updateLivePreview();
    });
  }

  $('#wBgOpacity')?.addEventListener('input', (e) => {
    const val = Number(e.target.value);
    if ($('#valOpacityLabel')) {
      $('#valOpacityLabel').textContent = val === 0 ? '0% (100% Transparente)' : `${val}% ${val === 100 ? '(Sólido)' : '(Translúcido)'}`;
    }
    store.update((s) => {
      s.config.widget = s.config.widget || {};
      s.config.widget.opacity = val;
      if (val === 0) {
        s.config.widget.theme = 'transparent';
      } else if (s.config.widget.theme === 'transparent') {
        s.config.widget.theme = 'minimal';
      }
    });
    $('#widgetUrl').value = widgetUrl();
    updateLivePreview();
  });

  $('#wScale')?.addEventListener('input', (e) => {
    $('#wScaleLabel').textContent = e.target.value + '%';
  });
  $('#wScale')?.addEventListener('change', (e) => {
    store.update((s) => {
      s.config.widget = s.config.widget || {};
      s.config.widget.scale = Number(e.target.value);
    });
    $('#widgetUrl').value = widgetUrl();
    updateLivePreview();
  });

  // Alternar demo preview
  $('#btnToggleDemoPreview')?.addEventListener('click', () => {
    previewMode = previewMode === 'playing' ? 'idle' : 'playing';
    updateLivePreview();
  });
}

function handleTwitchLogin(e) {
  if (e && e.preventDefault) e.preventDefault();
  const url = buildAuthUrl();
  window.location.href = url;
  return false;
}
window.handleTwitchLogin = handleTwitchLogin;

$$('.btn-twitch-auth, #btnTwitchTop, #btnTwitchDiscord, #btnLoginTwitch, #btnTwitchHome, #btnAuthQuickStreamer').forEach((el) => {
  if (el.tagName && el.tagName.toLowerCase() === 'a') el.href = buildAuthUrl();
  el.addEventListener('click', handleTwitchLogin);
  el.addEventListener('touchend', handleTwitchLogin, { passive: false });
});

async function copyWidget() {
  const ok = await copyText(widgetUrl());
  toast(ok ? 'Link do widget copiado!' : 'Erro ao copiar: ' + widgetUrl(), 3500);
}

$('#btnCopyWidget').addEventListener('click', copyWidget);
$('#btnCopyWidget2').addEventListener('click', copyWidget);
$('#btnWidget').addEventListener('click', () => window.open(widgetUrl(), '_blank', 'noopener'));
$('#btnWidgetPreview').addEventListener('click', () => window.open(widgetUrl(), '_blank', 'noopener'));

// ---------------------------------------------------------------- config
function syncConfigForm(s) {
  const c = s.config;
  if ($('#cfgChannel') && document.activeElement !== $('#cfgChannel')) $('#cfgChannel').value = c.channel || '';
  if ($('#cfgNick') && document.activeElement !== $('#cfgNick')) $('#cfgNick').value = c.botNick || '';
  try {
    if ($('#cfgToken')) $('#cfgToken').value = localStorage.getItem(LS_TOKEN) || '';
    if ($('#cfgClientId')) $('#cfgClientId').value = localStorage.getItem(LS_CLIENT) || '04ajnvlju5loqchkmzfl7v622veib6';
    if ($('#cfgSecret')) $('#cfgSecret').value = localStorage.getItem(LS_SECRET) || '';
  } catch { /* storage indisponível */ }

  if ($('#cfgEveryone')) $('#cfgEveryone').checked = !!c.allowEveryonePlay;
  if ($('#cfgAnnounceNow')) $('#cfgAnnounceNow').checked = !!c.announceNow;
  if ($('#cfgAnnounceQueue')) $('#cfgAnnounceQueue').checked = !!c.announceQueue;
  if ($('#cfgAutoSkip')) $('#cfgAutoSkip').checked = !!c.autoSkipError;
  if ($('#cfgPerUser')) $('#cfgPerUser').value = c.perUserCooldown ?? 15;
  if ($('#cfgGlobal')) $('#cfgGlobal').value = c.globalCooldown ?? 2;
  if ($('#cfgMaxQueue')) $('#cfgMaxQueue').value = c.maxQueue ?? 50;
  if ($('#cfgMaxPlaylist')) $('#cfgMaxPlaylist').value = c.maxPlaylist ?? 20;
  if ($('#cfgSkipVotes')) $('#cfgSkipVotes').value = c.skipVotes ?? 3;
  if ($('#cfgPoll')) $('#cfgPoll').value = c.pollInterval ?? 5;
  if ($('#redirectUri')) $('#redirectUri').textContent = location.origin + '/oauth.html';

  const ai = c.ai || {};
  if ($('#cfgAiEnabled')) $('#cfgAiEnabled').checked = !!ai.enabled;
  if ($('#cfgAiBaseUrl') && document.activeElement !== $('#cfgAiBaseUrl')) $('#cfgAiBaseUrl').value = ai.baseUrl || 'https://api.groq.com/openai/v1';
  if ($('#cfgAiModel') && document.activeElement !== $('#cfgAiModel')) $('#cfgAiModel').value = ai.model || 'qwen/qwen3.8-27b';
  if ($('#cfgAiApiKey') && document.activeElement !== $('#cfgAiApiKey')) $('#cfgAiApiKey').value = ai.apiKey || '';
  if ($('#cfgAiSystem') && document.activeElement !== $('#cfgAiSystem')) $('#cfgAiSystem').value = ai.systemPrompt || '';
}

function saveConfig() {
  const token = $('#cfgToken')?.value?.trim();
  const clientId = $('#cfgClientId')?.value?.trim();
  const secret = $('#cfgSecret')?.value?.trim();
  try {
    if (token !== undefined) {
      if (token) localStorage.setItem(LS_TOKEN, token.replace(/^oauth:/i, ''));
      else localStorage.removeItem(LS_TOKEN);
    }
    if (clientId !== undefined) {
      if (clientId) localStorage.setItem(LS_CLIENT, clientId);
      else localStorage.removeItem(LS_CLIENT);
    }
    if (secret !== undefined) {
      if (secret) localStorage.setItem(LS_SECRET, secret);
      else localStorage.removeItem(LS_SECRET);
    }
  } catch { /* storage indisponível */ }

  const newChan = $('#cfgChannel')?.value?.trim().toLowerCase().replace(/^#/, '');
  if (newChan) {
    currentChannel = newChan;
    localStorage.setItem('alive.channel', newChan);
    store.setChannel(newChan);
  }

  store.update((s) => {
    if (newChan) s.config.channel = newChan;
    if ($('#cfgNick')) s.config.botNick = $('#cfgNick').value.trim().toLowerCase();
    if ($('#cfgEveryone')) s.config.allowEveryonePlay = $('#cfgEveryone').checked;
    if ($('#cfgAnnounceNow')) s.config.announceNow = $('#cfgAnnounceNow').checked;
    if ($('#cfgAnnounceQueue')) s.config.announceQueue = $('#cfgAnnounceQueue').checked;
    if ($('#cfgAutoSkip')) s.config.autoSkipError = $('#cfgAutoSkip').checked;
    if ($('#cfgPerUser')) s.config.perUserCooldown = Math.max(0, Number($('#cfgPerUser').value) || 0);
    if ($('#cfgGlobal')) s.config.globalCooldown = Math.max(0, Number($('#cfgGlobal').value) || 0);
    if ($('#cfgMaxQueue')) s.config.maxQueue = Math.max(1, Number($('#cfgMaxQueue').value) || 50);
    if ($('#cfgMaxPlaylist')) s.config.maxPlaylist = Math.max(1, Number($('#cfgMaxPlaylist').value) || 20);
    if ($('#cfgSkipVotes')) s.config.skipVotes = Math.max(1, Number($('#cfgSkipVotes').value) || 3);
    if ($('#cfgPoll')) s.config.pollInterval = Math.max(2, Number($('#cfgPoll').value) || 5);
    if (!s.config.ai) s.config.ai = {};
    if ($('#cfgAiEnabled')) s.config.ai.enabled = $('#cfgAiEnabled').checked;
    if ($('#cfgAiBaseUrl')) s.config.ai.baseUrl = $('#cfgAiBaseUrl').value.trim();
    if ($('#cfgAiModel')) s.config.ai.model = $('#cfgAiModel').value.trim();
    if ($('#cfgAiApiKey')) s.config.ai.apiKey = $('#cfgAiApiKey').value.trim();
    if ($('#cfgAiSystem')) s.config.ai.systemPrompt = $('#cfgAiSystem').value.trim();
    pushLog(s, 'config', 'Configurações atualizadas');
  });
  store.flush();
  toast('Configurações salvas!');
}

// ------------------------------------------------------------------- aba ia
let isEditingAiPrompt = false;

function updateAiStatusBadge(enabled) {
  const badge = $('#aiStatusBadge');
  if (!badge) return;
  if (enabled) {
    badge.textContent = '● ATIVA NO CHAT';
    badge.style.background = 'rgba(0, 243, 255, 0.15)';
    badge.style.color = '#00f3ff';
    badge.style.borderColor = 'rgba(0, 243, 255, 0.35)';
  } else {
    badge.textContent = '○ DESATIVADA';
    badge.style.background = 'rgba(239, 68, 68, 0.15)';
    badge.style.color = '#f87171';
    badge.style.borderColor = 'rgba(239, 68, 68, 0.35)';
  }
}

function updateAiPromptCounter() {
  const ta = $('#cfgAiSystem');
  const counter = $('#aiPromptCharCount');
  if (!ta || !counter) return;
  const len = ta.value.length;
  counter.textContent = `${len} / 4000`;
  counter.style.color = len > 3800 ? '#f87171' : 'var(--muted)';
}

function syncIaTab(s) {
  const ai = s?.config?.ai || {};
  const isEnabled = !!ai.enabled;

  if ($('#cfgAiEnabled')) {
    $('#cfgAiEnabled').checked = isEnabled;
  }
  updateAiStatusBadge(isEnabled);

  if ($('#cfgAiBaseUrl') && document.activeElement !== $('#cfgAiBaseUrl')) {
    $('#cfgAiBaseUrl').value = ai.baseUrl || 'https://api.groq.com/openai/v1';
  }
  if ($('#cfgAiModel') && document.activeElement !== $('#cfgAiModel')) {
    $('#cfgAiModel').value = ai.model || 'qwen/qwen3.8-27b';
  }
  if ($('#cfgAiApiKey') && document.activeElement !== $('#cfgAiApiKey')) {
    $('#cfgAiApiKey').value = ai.apiKey || '';
  }

  const ta = $('#cfgAiSystem');
  if (ta && !isEditingAiPrompt && document.activeElement !== ta) {
    ta.value = ai.systemPrompt || '';
    updateAiPromptCounter();
  }
}

function saveAiSettings({ showToast = true } = {}) {
  const enabled = $('#cfgAiEnabled') ? $('#cfgAiEnabled').checked : true;
  const baseUrl = ($('#cfgAiBaseUrl')?.value || 'https://api.groq.com/openai/v1').trim();
  const model = ($('#cfgAiModel')?.value || 'qwen/qwen3.8-27b').trim();
  const apiKey = ($('#cfgAiApiKey')?.value || '').trim();
  const systemPrompt = ($('#cfgAiSystem')?.value || '').trim();

  store.update((s) => {
    if (!s.config) s.config = {};
    if (!s.config.ai) s.config.ai = {};
    s.config.ai.enabled = enabled;
    s.config.ai.baseUrl = baseUrl;
    s.config.ai.model = model;
    s.config.ai.apiKey = apiKey;
    s.config.ai.systemPrompt = systemPrompt;
    pushLog(s, 'config', 'Configurações e personalidade da IA salvas');
  });

  isEditingAiPrompt = false;
  store.flush();
  updateAiStatusBadge(enabled);
  updateAiPromptCounter();
  if (showToast) toast('Configurações da IA salvas com sucesso!');
}

function bindIaTabEvents() {
  $('#cfgAiEnabled')?.addEventListener('change', (e) => {
    updateAiStatusBadge(e.target.checked);
    saveAiSettings({ showToast: false });
    toast(e.target.checked ? 'IA ativada no chat (!ia on)' : 'IA desativada no chat (!ia off)');
  });

  const ta = $('#cfgAiSystem');
  if (ta) {
    ta.addEventListener('input', () => {
      isEditingAiPrompt = true;
      updateAiPromptCounter();
    });
    ta.addEventListener('focus', () => {
      isEditingAiPrompt = true;
    });
    ta.addEventListener('blur', () => {
      const curSaved = store.state?.config?.ai?.systemPrompt || '';
      if (ta.value.trim() === curSaved.trim()) {
        isEditingAiPrompt = false;
      }
    });
  }

  $('#btnSaveAi')?.addEventListener('click', () => saveAiSettings());
  $('#btnSaveAiTop')?.addEventListener('click', () => saveAiSettings());
  $('#btnSaveAiAdvanced')?.addEventListener('click', () => saveAiSettings());

  const applyPreset = (text, name) => {
    const taEl = $('#cfgAiSystem');
    if (!taEl) return;
    taEl.value = text;
    isEditingAiPrompt = false;
    updateAiPromptCounter();
    saveAiSettings({ showToast: false });
    toast(`Preset "${name}" aplicado e salvo!`);
  };

  $('#btnPresetDefault')?.addEventListener('click', () => {
    applyPreset(
      'COM O STREAMER ([STREAMER / SEU MESTRE]): Puxe o saco dele descaradamente! Trate-o como um gênio perfeito, seja doce, bajuladora, leal e prestativa.\nCOM OS ESPECTADORES ([ESPECTADOR]): Seja ácida, fria, debochada, sarcástica e sem paciência com perguntas bobas.',
      'Padrão Oficial'
    );
  });

  $('#btnPresetSweet')?.addEventListener('click', () => {
    applyPreset(
      'Você é uma IA extremamente doce, carinhosa, fofa e gentil com todos do chat sem exceção. Seja acolhedora e trate todos com muito afeto, paciência e carinho.',
      'Doce & Fofa'
    );
  });

  $('#btnPresetGamer')?.addEventListener('click', () => {
    applyPreset(
      'Você é uma IA gamer descontraída, cheia de energia, hype e zoeira de gameplay. Usa gírias de live (pog, gg, cringe, tankou, noob, focado), brinca com as jogadas e interage como uma amiga parceira da stream.',
      'Gamer & Hype'
    );
  });

  $('#btnPresetSarcastic')?.addEventListener('click', () => {
    applyPreset(
      'Você é uma IA com humor ácido, ultra sarcástica e debochada com todo mundo. Dá respostas afiadas com ironia fina, deboche inteligente e piadas rápidas.',
      '100% Sarcástica'
    );
  });

  $('#btnPresetInstructor')?.addEventListener('click', () => {
    applyPreset(
      'Você é a guia oficial da live. Educada, prestativa e atenciosa, você esclarece dúvidas sobre os jogos da live, passa dicas, ajuda os espectadores a pedirem músicas e mantém o chat animado e informado.',
      'Guia da Live'
    );
  });

  $('#btnClearAiPrompt')?.addEventListener('click', () => {
    applyPreset(
      'COM O STREAMER ([STREAMER / SEU MESTRE]): Puxe o saco dele descaradamente! Trate-o como um gênio perfeito, seja doce, bajuladora, leal e prestativa.\nCOM OS ESPECTADORES ([ESPECTADOR]): Seja ácida, fria, debochada, sarcástica e sem paciência com perguntas bobas.',
      'Padrão Oficial'
    );
  });

  $('#btnTestAi')?.addEventListener('click', async () => {
    const resultEl = $('#aiTestResult');
    const statusEl = $('#aiSimStatus');
    const btn = $('#btnTestAi');
    const promptInput = $('#aiTestPrompt');
    const prompt = (promptInput?.value || 'Quem é você e o que faz na live?').trim();

    if (btn) btn.disabled = true;
    if (statusEl) statusEl.textContent = 'Pensando...';
    if (resultEl) {
      resultEl.textContent = 'Processando resposta no chat...';
      resultEl.style.color = '#a1a1aa';
    }

    try {
      const aiCfg = store.state.config?.ai || {};
      const baseUrl = ($('#cfgAiBaseUrl')?.value || aiCfg.baseUrl || 'https://api.groq.com/openai/v1').trim();
      const apiKey = ($('#cfgAiApiKey')?.value || aiCfg.apiKey || '').trim();
      const model = ($('#cfgAiModel')?.value || aiCfg.model || 'qwen/qwen3.8-27b').trim();
      const systemPrompt = ($('#cfgAiSystem')?.value || aiCfg.systemPrompt || '').trim();

      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `[Contexto da Live: Canal #${currentChannel || 'streamer'}] [STREAMER / SEU MESTRE] ${prompt}`,
          channel: currentChannel,
          systemPrompt,
          model,
          apiKey,
          baseUrl
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.text) {
        throw new Error(data?.error || `Erro HTTP ${res.status}`);
      }
      const text = data.text;

      if (resultEl) {
        resultEl.textContent = text;
        resultEl.style.color = '#efeff1';
      }
      if (statusEl) {
        statusEl.textContent = 'Respondido';
        statusEl.style.color = '#4ade80';
      }
      toast('Resposta da IA recebida com sucesso!');
    } catch (err) {
      if (resultEl) {
        resultEl.textContent = `Falha ao consultar IA: ${err.message}`;
        resultEl.style.color = '#f87171';
      }
      if (statusEl) {
        statusEl.textContent = 'Erro';
        statusEl.style.color = '#f87171';
      }
      toast(`Falha no teste: ${err.message}`);
    } finally {
      if (btn) btn.disabled = false;
    }
  });
}

$('#btnSaveCfg')?.addEventListener('click', saveConfig);
$('#btnSaveChannel')?.addEventListener('click', async () => {
  const val = ($('#cfgChannel')?.value || '').trim().toLowerCase().replace(/^#/, '').replace(/^https?:\/\/(www\.)?twitch\.tv\//i, '').replace(/[^a-z0-9_]/g, '');
  if (!val) {
    toast('Digite o nome do seu canal na Twitch.');
    $('#cfgChannel')?.focus();
    return;
  }
  localStorage.setItem('alive.channel', val);
  currentChannel = val;
  store.setChannel(val);
  store.update((s) => { s.config.channel = val; });
  toast(`Canal configurado: #${val}! Conectando bot...`, 3000);
  renderUserHeader();
  await connect();
});
$('#btnConnect')?.addEventListener('click', async () => {
  saveConfig();
  await connect();
});
$('#btnDisconnect')?.addEventListener('click', () => disconnect());
$('#btnServerBotToggle')?.addEventListener('click', toggleServerBot);

$('#btnShowToken')?.addEventListener('click', () => {
  const inp = $('#cfgToken');
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
  if ($('#btnShowToken')) $('#btnShowToken').textContent = inp.type === 'password' ? 'ver' : 'ocultar';
});

$('#btnAuthLink')?.addEventListener('click', (e) => {
  e.preventDefault();
  const clientId = $('#cfgClientId')?.value.trim();
  if (!clientId) {
    toast('Preencha o Client ID antes.');
    $('#cfgClientId')?.focus();
    return;
  }
  window.open(buildAuthUrl(clientId), '_blank', 'noopener');
});

$('#btnFindNick')?.addEventListener('click', async () => {
  const token = $('#cfgToken')?.value.trim();
  const clientId = $('#cfgClientId')?.value.trim();
  if (!token) return toast('Cole o token antes.');
  if ($('#btnFindNick')) $('#btnFindNick').disabled = true;
  try {
    const login = await resolveBotNick(token, clientId);
    if (login) {
      if ($('#cfgNick')) $('#cfgNick').value = login;
      toast(`Nick identificado: @${login}`);
    } else {
      toast('Não foi possível identificar o nick automaticamente.', 4000);
    }
  } finally {
    if ($('#btnFindNick')) $('#btnFindNick').disabled = false;
  }
});

$('#btnReset')?.addEventListener('click', () => {
  if (!confirm('Deseja zerar a fila, histórico e configurações?')) return;
  const keepChannel = store.state.config.channel;
  const keepNick = store.state.config.botNick;
  store.update((s) => {
    const fresh = clone(s);
    fresh.now = null; fresh.queue = []; fresh.history = []; fresh.skip = null;
    fresh.log = []; fresh.stats = { played: 0, requested: 0 }; fresh.volume = 70;
    fresh.config.channel = keepChannel;
    fresh.config.botNick = keepNick;
    Object.assign(s, fresh);
    pushLog(s, 'config', 'Estado resetado');
  });
  toast('Estado reinicializado.');
});

// ------------------------------------------------------- render principal
store.subscribe((s) => {
  renderUserHeader();
  renderNow(s);
  syncPanelPlayer(s);
  renderQueue(s);
  renderEvents(s);
  renderCmds(s);
  renderTimers(s);
  syncWidgetForm(s);
  syncIaTab(s);
  volRange.value = s.volume;
  $('#volLabel').textContent = String(s.volume);

  const id = s.now?.id || null;
  const grew = s.queue.length > prevQueueLen;
  const newest = s.queue[s.queue.length - 1];
  prevQueueLen = s.queue.length;

  if (firstSync) {
    firstSync = false;
    prevNowId = id;
    return;
  }
  if (runnerBusy) { prevNowId = id; return; }
  if (id && id !== prevNowId && s.config.announceNow) {
    send(`Tocando agora: ${short(s.now.title, 70)} — pedido por ${s.now.requestedBy}`);
  }
  if (grew && newest && s.config.announceQueue) {
    send(`Na fila: ${short(newest.title, 60)} (posição ${s.queue.length}) — ${newest.requestedBy}`);
  }
  prevNowId = id;
});

// --------------------------------------------------- discord live notification
let discordLoaded = false;
let discordLiveData = null;
let discordUserData = null;

function getMonitoredChannel() {
  const authUser = (() => { try { return JSON.parse(localStorage.getItem('alive.user') || 'null'); } catch { return null; } })();
  const authLogin = (localStorage.getItem('alive.tokenLogin') || authUser?.login || currentChannel || '').trim().toLowerCase();
  return authLogin;
}

async function syncDiscordTab() {
  initDiscordTabListeners();
  const channel = getMonitoredChannel();
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

async function loadDiscordGuildsAndChannels(targetGuildId) {
  const channel = getMonitoredChannel();
  try {
    const res = await fetch(`/api/discord?action=guilds${channel ? `&channel=${encodeURIComponent(channel)}` : ''}`);
    if (!res.ok) return;
    const d = await res.json();
    const rowGuild = $('#rowDcGuildSelect');
    const selGuild = $('#cfgDcGuildSelect');
    if (d.ok && Array.isArray(d.guilds) && d.guilds.length > 0) {
      if (rowGuild && selGuild) {
        rowGuild.style.display = 'block';
        selGuild.innerHTML = '<option value="">Selecione o seu Servidor...</option>' +
          d.guilds.map((g) => `<option value="${g.id}">${g.name}</option>`).join('');
        
        const saved = targetGuildId || selGuild.dataset.savedGuild || (selGuild.value && selGuild.value !== '' ? selGuild.value : '');
        if (saved && d.guilds.some((g) => g.id === saved)) {
          selGuild.value = saved;
          await loadChannelsForGuild(saved, false);
        } else {
          selGuild.value = '';
          const selCh = $('#cfgDcChannelSelect');
          if (selCh) {
            selCh.innerHTML = '<option value="">Selecione canal</option>' +
              '<option value="custom">Outro (Inserir Link de Webhook)</option>';
          }
        }
      }
    }
  } catch {}
}

async function loadChannelsForGuild(guildId, autoSelectFirst = false) {
  if (!guildId) return;
  try {
    const res = await fetch(`/api/discord?action=channels&guildId=${encodeURIComponent(guildId)}`);
    if (!res.ok) return;
    const d = await res.json();
    if (d.ok && Array.isArray(d.channels) && d.channels.length > 0) {
      const selCh = $('#cfgDcChannelSelect');
      if (selCh) {
        selCh.innerHTML = '<option value="">Selecione canal</option>' +
          d.channels.map((c) => `<option value="${c.id}" data-name="${c.name}">#${c.name}</option>`).join('') +
          '<option value="custom">Outro (Inserir Link de Webhook)</option>';
        
        const savedTarget = $('#cfgDcWebhook')?.value.trim();
        if (savedTarget && d.channels.some(c => c.id === savedTarget)) {
          selCh.value = savedTarget;
          const matched = d.channels.find(c => c.id === savedTarget);
          if (matched && $('#cfgDcChannelName')) $('#cfgDcChannelName').value = matched.name;
        } else if (autoSelectFirst && d.channels[0]) {
          selCh.value = d.channels[0].id;
          if ($('#cfgDcChannelName')) $('#cfgDcChannelName').value = d.channels[0].name;
          if ($('#cfgDcWebhook')) $('#cfgDcWebhook').value = d.channels[0].id;
          updateDiscordPreview();
        }
      }
    }
  } catch {}
}

async function loadDiscordData(channel) {
  if (!channel || channel === 'streamer') return;
  try {
    const res = await fetch(`/api/discord?channel=${encodeURIComponent(channel)}`);
    if (!res.ok) return;
    const d = await res.json();
    discordLiveData = d.live;
    discordUserData = d.user;

    const badge = $('#dcBadgeLiveStatus');
    const badgeText = $('#dcTextLiveStatus');
    if (discordLiveData) {
      if (badge) badge.className = 'live-indicator online';
      if (badgeText) badgeText.textContent = `AO VIVO (${discordLiveData.viewer_count || 0})`;
    } else {
      if (badge) badge.className = 'live-indicator offline';
      if (badgeText) badgeText.textContent = 'OFFLINE NA TWITCH';
    }

    if (discordUserData?.profile_image_url) {
      const av = $('#dcStreamerAvatar');
      if (av) av.src = discordUserData.profile_image_url;
      const prevAv = $('#dcPrevAuthorAvatar');
      if (prevAv) prevAv.src = discordUserData.profile_image_url;
    }

    if (d.config) {
      const c = d.config;
      if ($('#cfgDcEnabled')) $('#cfgDcEnabled').checked = c.enabled !== false;
      if ($('#cfgDcGuildSelect') && c.guildId) {
        $('#cfgDcGuildSelect').dataset.savedGuild = c.guildId;
        if ($('#cfgDcGuildSelect').value !== c.guildId) {
          $('#cfgDcGuildSelect').value = c.guildId;
          await loadChannelsForGuild(c.guildId);
        }
      }
      if ($('#cfgDcWebhook')) $('#cfgDcWebhook').value = c.webhookUrl || '';
      if ($('#cfgDcChannelName')) $('#cfgDcChannelName').value = c.channelName || (c.webhookUrl ? 'webhook' : 'lives');
      if ($('#cfgDcMessage')) $('#cfgDcMessage').value = c.message || '[LIVE] **{streamer}** está ao vivo na Twitch | **{game}**';
      if ($('#cfgDcEmbedTitle')) $('#cfgDcEmbedTitle').value = c.embedTitle || '▸ {title}';
      if ($('#cfgDcEmbedDesc')) $('#cfgDcEmbedDesc').value = c.embedDesc || 'A live acabou de começar! Venha interagir no chat e pedir suas músicas favoritas.';
      if ($('#cfgDcEmbedColor')) $('#cfgDcEmbedColor').value = c.embedColor || '#9146FF';
      if ($('#cfgDcIncludeThumb')) $('#cfgDcIncludeThumb').checked = c.includeThumbnail !== false;
      if ($('#cfgDcRoleId')) $('#cfgDcRoleId').value = c.roleId || '';

      const chs = c.channels || {};
      if ($('#cfgDcTwitchChannel')) $('#cfgDcTwitchChannel').value = chs.twitch || channel || '';
      if ($('#cfgDcYoutubeChannel')) $('#cfgDcYoutubeChannel').value = chs.youtube || '';
      if ($('#cfgDcKickChannel')) $('#cfgDcKickChannel').value = chs.kick || '';
      if ($('#cfgDcTiktokChannel')) $('#cfgDcTiktokChannel').value = chs.tiktok || '';

      const mRadio = document.querySelector(`input[name="dcMentionType"][value="${c.mention || 'everyone'}"]`);
      if (mRadio) {
        mRadio.checked = true;
        $$('#tab-discord .mention-card').forEach((mc) => mc.classList.remove('selected'));
        mRadio.closest('.mention-card')?.classList.add('selected');
      }
    }
  } catch (err) {
    console.warn('[alive] Erro ao carregar discord data:', err);
  }
}

function updateDiscordPreview() {
  const channel = getMonitoredChannel() || 'streamer';
  const streamer = discordLiveData?.user_name || discordUserData?.display_name || channel;
  const title = discordLiveData?.title || '▸ Transmissão Ao Vivo • !play no chat';
  const game = discordLiveData?.game_name || 'Just Chatting';
  const viewers = String(discordLiveData?.viewer_count ?? '120');
  const url = `https://twitch.tv/${channel}`;

  const chName = $('#cfgDcChannelName')?.value.trim() || 'lives';
  if ($('#dcPreviewChannelName')) $('#dcPreviewChannelName').textContent = chName.replace(/^#/, '');

  const color = $('#cfgDcEmbedColor')?.value || '#9146FF';
  if ($('#dcLabelColorHex')) $('#dcLabelColorHex').textContent = color.toUpperCase();
  if ($('#dcPrevEmbedBox')) $('#dcPrevEmbedBox').style.borderLeftColor = color;

  const mType = document.querySelector('input[name="dcMentionType"]:checked')?.value || 'everyone';
  const roleId = $('#cfgDcRoleId')?.value.trim() || '';
  let mText = '';
  if (mType === 'everyone') mText = '@everyone';
  else if (mType === 'here') mText = '@here';
  else if (mType === 'role' && roleId) mText = `<@&${roleId}>`;

  const rowRoleId = $('#dcRowRoleId');
  if (rowRoleId) rowRoleId.style.display = mType === 'role' ? 'flex' : 'none';

  let rawMsg = $('#cfgDcMessage')?.value || '';
  let renderedMsg = rawMsg
    .replace(/\{streamer\}/gi, streamer)
    .replace(/\{title\}/gi, title)
    .replace(/\{game\}/gi, game)
    .replace(/\{url\}/gi, url)
    .replace(/\{viewers\}/gi, viewers);

  if (mText && !renderedMsg.includes(mText)) {
    renderedMsg = `${mText} ${renderedMsg}`;
  }
  if ($('#dcPrevContentText')) $('#dcPrevContentText').textContent = renderedMsg;

  if ($('#dcPrevAuthorName')) $('#dcPrevAuthorName').textContent = `${streamer} • Ao Vivo na Twitch`;
  const embedTitle = ($('#cfgDcEmbedTitle')?.value || '▸ {title}')
    .replace(/\{streamer\}/gi, streamer)
    .replace(/\{title\}/gi, title)
    .replace(/\{game\}/gi, game);
  if ($('#dcPrevEmbedTitle')) {
    $('#dcPrevEmbedTitle').textContent = embedTitle;
    $('#dcPrevEmbedTitle').href = url;
  }

  const embedDesc = ($('#cfgDcEmbedDesc')?.value || '')
    .replace(/\{streamer\}/gi, streamer)
    .replace(/\{title\}/gi, title)
    .replace(/\{game\}/gi, game);
  if ($('#dcPrevEmbedDesc')) $('#dcPrevEmbedDesc').textContent = embedDesc;

  if ($('#dcPrevFieldGame')) $('#dcPrevFieldGame').textContent = game;
  if ($('#dcPrevFieldViewers')) $('#dcPrevFieldViewers').textContent = viewers;

  const showThumb = $('#cfgDcIncludeThumb')?.checked !== false;
  if ($('#dcPrevEmbedImage')) $('#dcPrevEmbedImage').style.display = showThumb ? 'block' : 'none';

  if (discordUserData?.profile_image_url && $('#dcPrevAuthorAvatar')) {
    $('#dcPrevAuthorAvatar').src = discordUserData.profile_image_url;
  }
  if ($('#dcPrevLiveBtn')) {
    $('#dcPrevLiveBtn').href = url;
  }
}

async function saveDiscordConfig(quiet = false) {
  const channel = getMonitoredChannel();
  if (!channel || channel === 'streamer') {
    if (!quiet) toast('Conecte sua conta da Twitch primeiro.', 'error');
    return false;
  }
  const btn = $('#btnSaveDiscordConfig');
  if (btn && !quiet) {
    btn.disabled = true;
    btn.textContent = 'Salvando...';
  }

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
    channels: {
      twitch: $('#cfgDcTwitchChannel')?.value.trim() || channel || '',
      youtube: $('#cfgDcYoutubeChannel')?.value.trim() || '',
      kick: $('#cfgDcKickChannel')?.value.trim() || '',
      tiktok: $('#cfgDcTiktokChannel')?.value.trim() || '',
    },
  };

  try {
    const res = await fetch('/api/discord', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save', channel, config }),
    });
    if (res.ok) {
      if (!quiet) toast('Configuração do Discord salva com sucesso!');
      return true;
    } else {
      const d = await res.json().catch(() => ({}));
      if (!quiet) toast(d.error || 'Erro ao salvar configuração.', 'error');
      return false;
    }
  } catch {
    if (!quiet) toast('Erro de rede ao salvar.', 'error');
    return false;
  } finally {
    if (btn && !quiet) {
      btn.disabled = false;
      btn.textContent = 'Salvar Configurações';
    }
  }
}

function initDiscordTabListeners() {
  if (discordLoaded) return;
  discordLoaded = true;

  // Dropdown seletor de servidor Discord
  $('#cfgDcGuildSelect')?.addEventListener('change', (e) => {
    const guildId = e.target.value;
    loadChannelsForGuild(guildId);
  });

  // Dropdown seletor de canal
  $('#cfgDcChannelSelect')?.addEventListener('change', (e) => {
    const opt = e.target.selectedOptions?.[0];
    const val = e.target.value;
    if (!val) return;
    if (val === 'custom') {
      if ($('#cfgDcAdvancedRow')) $('#cfgDcAdvancedRow').style.display = 'block';
      $('#cfgDcWebhook')?.focus();
    } else {
      const chName = opt?.dataset?.name || val;
      if ($('#cfgDcChannelName')) $('#cfgDcChannelName').value = chName;
      if (/^\d{17,21}$/.test(val)) {
        if ($('#cfgDcWebhook')) $('#cfgDcWebhook').value = val;
      }
      updateDiscordPreview();
      saveDiscordConfig(true);
    }
  });

  $('#cfgDcChannelName')?.addEventListener('input', () => {
    updateDiscordPreview();
  });

  // Mentions
  $$('input[name="dcMentionType"]').forEach((r) => {
    r.addEventListener('change', () => {
      $$('#tab-discord .mention-card').forEach((mc) => mc.classList.remove('selected'));
      r.closest('.mention-card')?.classList.add('selected');
      updateDiscordPreview();
    });
  });

  // Color Swatches
  $$('#tab-discord .color-swatch-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('#tab-discord .color-swatch-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const c = btn.dataset.color;
      if ($('#cfgDcEmbedColor')) $('#cfgDcEmbedColor').value = c;
      updateDiscordPreview();
    });
  });

  $('#cfgDcEmbedColor')?.addEventListener('input', () => {
    $$('#tab-discord .color-swatch-btn').forEach((b) => b.classList.remove('active'));
    updateDiscordPreview();
  });

  // Tags click
  $$('#tab-discord .tag-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.tag;
      const ta = $('#cfgDcMessage');
      if (ta) {
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        ta.value = ta.value.substring(0, start) + tag + ta.value.substring(end);
        ta.focus();
        ta.selectionStart = ta.selectionEnd = start + tag.length;
        updateDiscordPreview();
      }
    });
  });

  ['cfgDcMessage', 'cfgDcEmbedTitle', 'cfgDcEmbedDesc', 'cfgDcRoleId', 'cfgDcTwitchChannel', 'cfgDcYoutubeChannel', 'cfgDcKickChannel', 'cfgDcTiktokChannel'].forEach((id) => {
    $(`#${id}`)?.addEventListener('input', updateDiscordPreview);
  });
  $('#cfgDcIncludeThumb')?.addEventListener('change', updateDiscordPreview);

  // Ativação rápida da notificação com persistência imediata
  $('#cfgDcEnabled')?.addEventListener('change', async (e) => {
    updateDiscordPreview();
    const isChecked = e.target.checked;
    toast(isChecked ? 'Notificações de Live ativadas!' : 'Notificações de Live desativadas.');
    await saveDiscordConfig(true);
  });

  // Salvar
  $('#btnSaveDiscordConfig')?.addEventListener('click', async () => {
    await saveDiscordConfig(false);
  });

  async function testDiscordNotification(platform = 'twitch', triggerBtn = null) {
    const channel = getMonitoredChannel();
    const webhookUrl = $('#cfgDcWebhook')?.value.trim() || '';
    const channelName = $('#cfgDcChannelName')?.value.trim() || '';

    if (triggerBtn) {
      triggerBtn.disabled = true;
    }

    const mType = document.querySelector('input[name="dcMentionType"]:checked')?.value || 'everyone';
    const config = {
      enabled: $('#cfgDcEnabled')?.checked !== false,
      channelName,
      webhookUrl,
      mention: mType,
      roleId: $('#cfgDcRoleId')?.value.trim() || '',
      message: $('#cfgDcMessage')?.value || '',
      embedTitle: $('#cfgDcEmbedTitle')?.value || '',
      embedDesc: $('#cfgDcEmbedDesc')?.value || '',
      embedColor: $('#cfgDcEmbedColor')?.value || '#9146FF',
      includeThumbnail: $('#cfgDcIncludeThumb')?.checked !== false,
      channels: {
        twitch: $('#cfgDcTwitchChannel')?.value.trim() || channel || '',
        youtube: $('#cfgDcYoutubeChannel')?.value.trim() || '',
        kick: $('#cfgDcKickChannel')?.value.trim() || '',
        tiktok: $('#cfgDcTiktokChannel')?.value.trim() || '',
      },
    };

    try {
      const res = await fetch('/api/discord', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test', channel, platform, config }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.ok) {
        toast(d.message || 'Notificação de teste enviada ao Discord com sucesso!');
      } else {
        toast(d.error || 'Falha ao enviar notificação para o Discord.', 'error');
      }
    } catch (e) {
      toast('Erro de rede ao testar.', 'error');
    } finally {
      if (triggerBtn) {
        triggerBtn.disabled = false;
      }
    }
  }

  // Botões de teste individuais por plataforma
  $$('.btn-test-platform').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const platform = btn.dataset.platform || 'twitch';
      const origText = btn.textContent;
      btn.textContent = '...';
      await testDiscordNotification(platform, btn);
      btn.textContent = origText;
    });
  });

  // Testar geral
  $('#btnTestDiscordWebhook')?.addEventListener('click', async () => {
    const btn = $('#btnTestDiscordWebhook');
    btn.disabled = true;
    const oldText = btn.innerHTML;
    btn.textContent = 'Enviando...';
    await testDiscordNotification('twitch', btn);
    btn.disabled = false;
    btn.innerHTML = oldText;
  });

  $('#btnCheckDiscordLive')?.addEventListener('click', async () => {
    const channel = getMonitoredChannel();
    if (!channel) return toast('Conecte sua conta da Twitch primeiro.', 'error');
    const btn = $('#btnCheckDiscordLive');
    if (btn) btn.textContent = 'Verificando...';
    try {
      const res = await fetch('/api/discord', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check', channel }),
      });
      const d = await res.json().catch(() => ({}));
      await loadDiscordData(channel);
      updateDiscordPreview();
      if (d.notified) {
        toast('Live detectada! Notificação enviada para o Discord!', 6000);
      } else if (d.ok && d.platforms) {
        const liveOn = Object.entries(d.platforms).filter(([, val]) => val?.live).map(([p]) => p);
        if (liveOn.length > 0) {
          toast(`Canais ao vivo detectados: ${liveOn.join(', ')}`);
        } else {
          toast('Todos os canais monitorados estão offline no momento.');
        }
      } else {
        toast('Verificação concluída.');
      }
    } catch {
      toast('Erro ao verificar live.', 'error');
    } finally {
      if (btn) btn.textContent = 'Verificar Live Agora';
    }
  });
}

// ----------------------------------------------------------------- boot
async function boot() {
  renderIcons(document);
  await checkAuthCallback();
  renderUserHeader();
  updateWebMuteUI();

  if (urlParams.get('tab') === 'discord') {
    switchTab('discord');
  }

  const pillBtn = $('#userPillBtn');
  const userDrop = $('#userDropdown');
  const btnLogout = $('#btnLogout');

  if (pillBtn && userDrop) {
    const toggleDrop = (e) => {
      e.stopPropagation();
      e.preventDefault();
      const isOpen = !userDrop.hidden;
      userDrop.hidden = isOpen;
      pillBtn.classList.toggle('open', !isOpen);
    };
    pillBtn.addEventListener('click', toggleDrop);
  }

  if (userDrop) {
    userDrop.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  document.addEventListener('click', () => {
    if (userDrop && !userDrop.hidden) {
      userDrop.hidden = true;
      pillBtn?.classList.remove('open');
    }
  });

  const performLogout = (e) => {
    if (e) {
      try { e.stopPropagation(); } catch { /* */ }
      try { e.preventDefault(); } catch { /* */ }
    }
    try { irc?.close(); } catch { /* */ }
    try { irc?.disconnect(); } catch { /* */ }
    irc = null;

    // Limpa todas as chaves de sessão e autenticação do localStorage
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('alive.') || k.startsWith('alive-') || k === 'alive.token' || k === 'alive.clientId' || k === 'alive.secret')) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
    sessionStorage.clear();

    if (store?.state?.config) {
      delete store.state.config.botToken;
      store.state.config.channel = '';
    }

    currentChannel = '';
    history.replaceState(null, '', location.pathname);

    if (userDrop) userDrop.hidden = true;
    pillBtn?.classList.remove('open');

    renderUserHeader();
    const authGate = $('#authGate');
    if (authGate) authGate.style.display = 'flex';
    toast('Você saiu da sua conta Twitch com sucesso.', 4000);
  };

  if (btnLogout) {
    btnLogout.addEventListener('click', performLogout);
    btnLogout.addEventListener('touchend', performLogout, { passive: false });
  }

  $('#btnAuthQuickStreamer')?.addEventListener('click', handleTwitchLogin);

  $$('#btnTwitchTop, #btnTwitchDiscord').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      handleTwitchLogin(e);
    });
  });

  store.start();

  runner = createRunner({
    store,
    send,
    resolveUrl: (u) => fetchJson('/api/resolve?url=' + encodeURIComponent(u) + '&max=' + store.state.config.maxPlaylist),
    searchQ: async (q) => (await fetchJson('/api/search?q=' + encodeURIComponent(q) + '&limit=8')).items || [],
  });

  bindWidgetForm();
  bindTimerEvents();
  bindIaTabEvents();
  syncWidgetForm(store.state);
  syncConfigForm(store.state);
  syncIaTab(store.state);
  renderCmds(store.state);
  renderTimers(store.state);
  renderEvents(store.state);
  $('#widgetUrl').value = widgetUrl();
  $('#btnClearChat')?.addEventListener('click', () => { if ($('#chatList')) $('#chatList').innerHTML = ''; });
  $('#status')?.addEventListener('click', () => {
    if (!currentChannel && !localStorage.getItem('alive.channel')) {
      const ch = prompt('Digite o nome do seu canal na Twitch para conectar o bot:');
      if (ch) {
        const clean = ch.trim().toLowerCase().replace(/^#/, '').replace(/^https?:\/\/(www\.)?twitch\.tv\//i, '').replace(/[^a-z0-9_]/g, '');
        if (clean) {
          localStorage.setItem('alive.channel', clean);
          currentChannel = clean;
          store.setChannel(clean);
          store.update((s) => { s.config.channel = clean; });
          if ($('#cfgChannel')) $('#cfgChannel').value = clean;
          renderUserHeader();
          connect().catch(console.error);
          return;
        }
      }
    }
    toast('Reconectando ao chat...');
    connect().catch((e) => console.error(e));
  });

  setInterval(tickNow, 500);
  setInterval(tickTimers, 10000);
  setInterval(checkServerBot, 4000);
  checkServerBot();

  // Conecta automaticamente apenas se o streamer estiver autenticado
  const authStreamerInit = getAuthStreamer();
  let activeCh = authStreamerInit ? authStreamerInit.login : '';
  const savedToken = (localStorage.getItem(LS_TOKEN) || '').trim();

  if (activeCh && savedToken) {
    const savedUser = (() => { try { return JSON.parse(localStorage.getItem('alive.user') || '{}'); } catch { return {}; } })();
    if (!savedUser?.profile_image_url) {
      try {
        const clientId = localStorage.getItem(LS_CLIENT) || '04ajnvlju5loqchkmzfl7v622veib6';
        await resolveBotNick(savedToken, clientId, false);
        renderUserHeader();
      } catch (e) {
        console.warn('Erro identificando perfil:', e);
      }
    }
  }

  if (activeCh) {
    currentChannel = activeCh;
    localStorage.setItem('alive.channel', activeCh);
    store.setChannel(activeCh);
    connect().catch((e) => console.error(e));

    const tokenNick = localStorage.getItem('alive.tokenLogin') || activeCh;
    // Registra o canal no bot persistente do servidor para não depender da página web
    fetchJson('/api/bot', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'join',
        channel: activeCh,
        nick: tokenNick,
        token: savedToken,
      }),
    }).then(() => checkServerBot()).catch(() => {});
  } else {
    setStatus('off', 'não conectado (clique em Entrar com a Twitch)');
  }

  // Inicializa o player oficial do YouTube no navegador do painel
  initPanelPlayer();
}

boot().catch((e) => {
  console.error('[alive] boot:', e);
  setStatus('error', 'falha ao iniciar');
});
