// Alive Bot — widget do OBS: toca a fila via player oficial do YouTube e mantém a UI em dia.
import { Store } from './store.js';
import { advanceQueue, pushLog, fmtTime, thumbFor } from './state.js';

const $ = (s) => (typeof document !== 'undefined' ? document.querySelector(s) : null);

const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const channel = (params.get('channel') || params.get('ch') || (typeof localStorage !== 'undefined' ? (localStorage.getItem('alive.channel') || localStorage.getItem('alive.tokenLogin') || '') : '')).toLowerCase().replace(/[^a-z0-9_]/g, '');
const store = new Store(channel);

let player = null;
let ytReady = false;
let curId = null;
let curStartedAt = 0;
let wasPaused = false;
let durationShown = 0;
let lastPosWrite = 0;
let lastQueueLen = store.state.queue.length;
let firstQueueRender = true;
let startChecked = false;
let stallCount = 0;
let stallAtEndCount = 0;
let lastStallPos = -1;

const els = typeof document !== 'undefined' ? {
  card: $('#card'), thumb: $('#thumb'), title: $('#title'), sub: $('#sub'),
  fill: $('#fill'), tcur: $('#tcur'), tdur: $('#tdur'), progress: $('#progress'),
  volbox: $('#volbox'), volval: $('#volval'), volIcon: $('#volIcon'),
  next: $('#next'), nextList: $('#nextList'), nextCount: $('#nextCount'),
  hint: $('#hint'), brand: $('#brand'), idle: $('#idle'),
  toast: $('#toast'),
  kicker: $('#kickerText'),
} : {};

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
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

export const PRESETS = {
  cyberpunk: { layout: 'glass', theme: 'minimal', accent: '#ff00ff', bg: '#0a0a0c', text: '#ffffff', opacity: 80, scale: 65, marquee: 0 },
  spotify: { layout: 'card', theme: 'minimal', accent: '#1db954', bg: '#121212', text: '#ffffff', opacity: 95, scale: 100, marquee: 1 },
  glass: { layout: 'glass', theme: 'minimal', accent: '#38bdf8', bg: '#0f172a', text: '#ffffff', opacity: 60, scale: 100, marquee: 1 },
  minimal: { layout: 'minimal', theme: 'contrast', accent: '#ffffff', bg: '#000000', text: '#ffffff', opacity: 100, scale: 100, marquee: 0 },
  ghost: { layout: 'card', theme: 'transparent', accent: '#ffffff', bg: '#000000', text: '#ffffff', opacity: 0, scale: 100, marquee: 1 },
  pill: { layout: 'pill', theme: 'minimal', accent: '#a855f7', bg: '#18181b', text: '#ffffff', opacity: 85, scale: 100, marquee: 1 },
  sunset: { layout: 'glass', theme: 'slate', accent: '#f59e0b', bg: '#18181b', text: '#ffffff', opacity: 80, scale: 100, marquee: 1 },
  ticker: { layout: 'ticker', theme: 'minimal', accent: '#ef4444', bg: '#09090b', text: '#ffffff', opacity: 95, scale: 100, marquee: 1 },
  neon: { layout: 'neon', theme: 'minimal', accent: '#00f3ff', bg: '#060a12', text: '#ffffff', opacity: 85, scale: 100, marquee: 1 },
  compact: { layout: 'compact', theme: 'slate', accent: '#a855f7', bg: '#09090b', text: '#f4f4f5', opacity: 90, scale: 90, marquee: 1, showKicker: 0, showTimes: 0 },
  vinyl: { layout: 'vinyl', theme: 'minimal', accent: '#f59e0b', bg: '#140f07', text: '#fef3c7', opacity: 90, scale: 100, marquee: 1 }
};

// ------------------------------------------------------------ configuração
function applyConfig(s) {
  const w = s.config.widget || {};
  const html = document.documentElement;

  const preKey = params.get('preset') || params.get('p') || w.preset || '';
  const pre = PRESETS[preKey] || {};

  // 1. Áudio no widget (OBS)
  const playAudio = params.has('audio')
    ? params.get('audio') !== '0'
    : (params.has('playAudio') ? params.get('playAudio') !== '0' : (w.playAudio !== undefined ? w.playAudio !== 0 : (pre.playAudio !== 0)));

  // 2. Estilo / Formato do widget
  const layout = params.get('layout') || w.layout || pre.layout || 'card';

  // 3. Tema visual
  const theme = params.get('theme') || w.theme || pre.theme || 'minimal';

  // 4. Posicionamento
  const pos = params.get('pos') || w.pos || pre.pos || 'bl';

  // 5. Escala
  const scale = Number(params.get('scale') || w.scale || pre.scale || 100);

  // 6. Vídeo do YouTube
  const video = params.get('video') || w.video || pre.video || 'off';

  // 7. Cores & Transparência customizadas
  const accent = params.get('accent') || w.accent || pre.accent || '#ffffff';
  const bg = params.get('bg') || w.bg || pre.bg || '#0a0a0c';
  const opacity = params.has('opacity') ? Number(params.get('opacity')) : (w.opacity !== undefined ? Number(w.opacity) : (pre.opacity !== undefined ? Number(pre.opacity) : 65));
  const textColor = params.get('text') || w.text || pre.text || '#ffffff';

  html.dataset.theme = theme;
  html.dataset.layout = layout;
  html.dataset.pos = pos;
  html.style.setProperty('--scale', String(Math.max(0.4, Math.min(3, scale / 100))));
  document.body.dataset.video = video;

  // Aplicação de transparência e cores
  html.style.setProperty('--accent', accent);
  html.style.setProperty('--text-color', textColor);
  const rgb = hexToRgb(bg) || { r: 10, g: 10, b: 12 };
  const alpha = Math.max(0, Math.min(100, opacity)) / 100;
  html.style.setProperty('--card-opacity', String(alpha));

  if (alpha === 0) {
    html.style.setProperty('--card', 'transparent');
    html.style.setProperty('--card-border', 'transparent');
  } else {
    html.style.setProperty('--card', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`);
    html.style.setProperty('--card-border', `rgba(255, 255, 255, ${Math.min(0.3, Math.max(0.1, alpha * 0.25))})`);
  }

  // 8. Visibilidade dos elementos
  const showArt = params.has('art') ? params.get('art') === '1' : (w.showArt !== undefined ? w.showArt !== 0 : (pre.showArt !== 0));
  const showEq = params.has('eq') ? params.get('eq') === '1' : (w.showEq !== undefined ? w.showEq !== 0 : (pre.showEq !== 0));
  const showProgress = params.has('prog') ? params.get('prog') === '1' : (w.showProgress !== undefined ? w.showProgress !== 0 : (pre.showProgress !== 0));
  const showRequester = params.has('req') ? params.get('req') === '1' : (w.showRequester !== undefined ? w.showRequester !== 0 : (pre.showRequester !== 0));
  const showQueue = params.has('queue') ? params.get('queue') === '1' : (w.showQueue !== undefined ? w.showQueue !== 0 : (pre.showQueue !== 0));
  const showHint = params.has('hint') ? params.get('hint') === '1' : (w.showHint !== undefined ? w.showHint !== 0 : (pre.showHint !== 0));
  const showLogo = params.has('logo') ? params.get('logo') === '1' : (w.showLogo !== undefined ? w.showLogo !== 0 : (pre.showLogo !== 0));
  const hideIdle = params.has('hideIdle') ? params.get('hideIdle') === '1' : (w.hideIdle !== undefined ? !!w.hideIdle : !!pre.hideIdle);
  const marquee = params.has('marquee') ? params.get('marquee') === '1' : (w.marquee !== undefined ? w.marquee !== 0 : (pre.marquee !== 0));

  document.body.classList.toggle('hide-art', !showArt);
  document.body.classList.toggle('hide-eq', !showEq);
  document.body.classList.toggle('hide-progress', !showProgress);
  document.body.classList.toggle('hide-requester', !showRequester);
  document.body.classList.toggle('hide-queue', !showQueue);
  document.body.classList.toggle('hide-hint', !showHint);
  document.body.classList.toggle('hide-logo', !showLogo);
  document.body.classList.toggle('hide-idle', hideIdle);
  document.body.classList.toggle('no-marquee', !marquee);
  document.body.classList.toggle('muted-widget', !playAudio);

  const paused = !!s.now?.paused;
  document.body.classList.toggle('paused', paused);
  if (els.kicker) els.kicker.textContent = paused ? 'PAUSADO' : 'TOCANDO AGORA';

  // Aplicar mute se configurado para não tocar som no widget
  if (ytReady && player) {
    try {
      if (!playAudio) {
        player.mute();
      } else {
        player.unMute();
        applyVolume(s.volume);
      }
    } catch { /* ignora */ }
  }

  // Atualizar indicador visual de áudio / volume
  if (els.volval) els.volval.textContent = playAudio ? String(Math.round(s.volume)) : 'MUDO';
  if (els.volIcon) {
    els.volIcon.innerHTML = playAudio
      ? '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>'
      : '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/>';
  }
}

function applyVolume(v) {
  const w = store.state.config.widget || {};
  const playAudio = params.has('audio')
    ? params.get('audio') !== '0'
    : (params.has('playAudio') ? params.get('playAudio') !== '0' : (w.playAudio !== 0));

  if (!playAudio) {
    if (ytReady && player && typeof player.mute === 'function') {
      try { player.mute(); } catch { /* */ }
    }
    if (els.volval) els.volval.textContent = 'MUDO';
    return;
  }

  const vol = Math.max(0, Math.min(100, Math.round(Number(v) || 70)));
  if (ytReady && player && typeof player.setVolume === 'function') {
    try {
      player.unMute();
      player.setVolume(vol);
    } catch { /* ainda carregando */ }
  }
  if (els.volval) els.volval.textContent = String(vol);
}

// ------------------------------------------------------------------ render
function render(s) {
  const now = s.now;
  els.idle.hidden = !!now;
  els.card.hidden = !now;

  if (now) {
    const thumb = now.thumb || thumbFor(now.id);
    if (els.thumb.getAttribute('src') !== thumb) els.thumb.src = thumb;
    els.title.textContent = now.title || '—';
    els.sub.textContent = [now.channel, now.requestedBy ? 'pedido por ' + now.requestedBy : '']
      .filter(Boolean).join(' · ');

    // título longo vira marquise suave delimitado estritamente
    const w = s.config.widget || {};
    const marquee = params.has('marquee') ? params.get('marquee') === '1' : (w.marquee !== 0);
    if (!marquee) {
      els.title.classList.remove('scroll');
    } else {
      els.title.classList.remove('scroll');
      requestAnimationFrame(() => {
        if (!marquee) return;
        const parentW = els.title.parentElement?.clientWidth || els.title.clientWidth;
        if (els.title.scrollWidth > parentW + 4) els.title.classList.add('scroll');
      });
    }
  }

  const qc = Number(params.get('qc') || s.config.widget?.queueCount || 3);
  const items = s.queue.slice(0, qc);
  const showQueue = params.has('queue') ? params.get('queue') === '1' : (s.config.widget?.showQueue !== 0);
  els.next.hidden = !showQueue || !items.length;
  if (items.length) {
    els.nextCount.textContent = `(${s.queue.length})`;
    els.nextList.innerHTML = items.map((x, i) => (
      `<li><span class="n">${i + 1}</span><span class="tt">${esc(x.title)}</span>` +
      `<span class="who">${esc(x.requestedBy || '')}</span></li>`
    )).join('');
  }

  // aviso de nova música na fila (ignora no carregamento inicial)
  if (!firstQueueRender && s.queue.length > lastQueueLen && lastQueueLen >= 0) {
    const newest = s.queue[s.queue.length - 1];
    showToast(`Nova música na fila: ${newest.title}${newest.requestedBy ? ' — ' + newest.requestedBy : ''}`);
    els.card.classList.remove('flash');
    void els.card.offsetWidth;
    els.card.classList.add('flash');
  }
  firstQueueRender = false;
  lastQueueLen = s.queue.length;
}

// -------------------------------------------------------- player do YouTube
function loadYTApi() {
  return new Promise((resolve, reject) => {
    if (window.YT && window.YT.Player) return resolve(window.YT);
    let resolved = false;
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (resolved) return;
      resolved = true;
      if (typeof prev === 'function') prev();
      resolve(window.YT);
    };
    const timer = setTimeout(() => {
      if (!resolved) {
        if (window.YT && window.YT.Player) {
          resolved = true;
          return resolve(window.YT);
        }
        console.warn('[alive widget] Timeout carregando API do YouTube, tentando novamente...');
        const retryTag = document.createElement('script');
        retryTag.src = 'https://www.youtube.com/iframe_api?retry=' + Date.now();
        document.head.appendChild(retryTag);
      }
    }, 12000);
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.onerror = () => {
      clearTimeout(timer);
      reject(new Error('falha ao carregar API do YouTube'));
    };
    document.head.appendChild(tag);
  });
}

let isTransitioning = false;
let isTransitioningTimer = null;
let retryingAlt = false;
const failedVideoIds = new Set();

function getSafeOrigin() {
  try {
    if (typeof location !== 'undefined' && location.origin && location.origin !== 'null' && (location.origin.startsWith('http://') || location.origin.startsWith('https://'))) {
      return location.origin;
    }
  } catch {}
  return undefined;
}

let userInteracted = false;

function showUnmutePrompt() {
  const el = document.getElementById('unmutePrompt');
  if (el) el.hidden = false;
}

function hideUnmutePrompt() {
  const el = document.getElementById('unmutePrompt');
  if (el) el.hidden = true;
}

function markUserInteracted() {
  userInteracted = true;
  hideUnmutePrompt();
  if (ytReady && player && store.state.now && !store.state.now.paused) {
    try {
      const w = store.state.config.widget || {};
      const playAudio = params.has('audio')
        ? params.get('audio') !== '0'
        : (params.has('playAudio') ? params.get('playAudio') !== '0' : (w.playAudio !== 0));
      if (playAudio) {
        player.unMute?.();
        applyVolume(store.state.volume);
      }
      player.playVideo?.();
    } catch {}
  }
}

function loadCurrent(s) {
  const now = s.now;
  if (!now || !now.id) {
    curId = null;
    curStartedAt = 0;
    startChecked = false;
    try { player?.stopVideo?.(); } catch { /* ignora */ }
    return;
  }
  const nowStartedAt = now.startedAt || 0;
  if (curId === now.id && curStartedAt === nowStartedAt && ytReady) return;

  if (!ytReady || !player) return;

  curId = now.id;
  curStartedAt = nowStartedAt;
  startChecked = false;
  stallCount = 0;
  stallAtEndCount = 0;
  lastStallPos = -1;
  wasPaused = !!now.paused;
  durationShown = now.duration || 0;
  const start = Math.max(0, Math.round(now.position || 0));

  const cleanId = String(now.id || '').trim();
  const safeStart = Number.isFinite(Number(start)) ? Math.max(0, Math.floor(Number(start))) : 0;

  try {
    if (now.paused) {
      if (typeof player.cueVideoById === 'function') {
        player.cueVideoById(cleanId, safeStart);
      } else {
        player.loadVideoById(cleanId, safeStart);
        setTimeout(() => { try { player.pauseVideo?.(); } catch {} }, 50);
      }
    } else {
      // Se ainda não houve interação do usuário, garante início mutado para não ser bloqueado por Autoplay Policy
      if (!userInteracted) {
        try { player.mute?.(); } catch {}
      }
      player.loadVideoById(cleanId, safeStart);
      try { player.playVideo?.(); } catch {}
    }

    const w = s.config.widget || {};
    const playAudio = params.has('audio')
      ? params.get('audio') !== '0'
      : (params.has('playAudio') ? params.get('playAudio') !== '0' : (w.playAudio !== 0));

    if (!playAudio) {
      player.mute?.();
    } else if (userInteracted) {
      player.unMute?.();
      applyVolume(s.volume);
    }
  } catch (e) {
    console.warn('[alive widget] loadVideoById erro:', e);
  }
}

function onPlayerStateChange(ev) {
  const st = ev?.data;

  // 0. Se a faixa entrou em estado CUED e não está pausada, inicia imediatamente
  if (st === YT_STATE.CUED && !store.state.now?.paused) {
    console.log('[alive widget] Faixa em estado CUED. Disparando playVideo...');
    try {
      if (!userInteracted) player?.mute?.();
      player?.playVideo?.();
    } catch {}
    return;
  }

  // 1. Faixa tocando ativamente (PLAYING)
  if (st === YT_STATE.PLAYING) {
    consecutiveErrors = 0;
    startChecked = true;
    wasPaused = false;
    document.body.classList.remove('paused');
    if (els.kicker) els.kicker.textContent = 'TOCANDO AGORA';

    if (store.state.now?.paused) {
      try { player.pauseVideo?.(); } catch {}
      wasPaused = true;
      document.body.classList.add('paused');
      if (els.kicker) els.kicker.textContent = 'PAUSADO';
      return;
    }

    // Regra Crítica: Desmutar e aplicar volume na reprodução ativa
    try {
      const w = store.state.config?.widget || {};
      const playAudio = params.has('audio')
        ? params.get('audio') !== '0'
        : (params.has('playAudio') ? params.get('playAudio') !== '0' : (w.playAudio !== 0));
      if (playAudio && player) {
        if (userInteracted) {
          player.unMute?.();
          applyVolume(store.state.volume);
          hideUnmutePrompt();
        } else {
          // Tenta desmutar com tolerância (OBS com áudio monitorado permite diretamente)
          player.unMute?.();
          applyVolume(store.state.volume);
        }
      }
    } catch {}

    // Reforços escalonados
    setTimeout(() => {
      try {
        const w = store.state.config?.widget || {};
        const playAudio = params.has('audio') ? params.get('audio') !== '0' : (w.playAudio !== 0);
        if (playAudio && player && userInteracted) {
          player.unMute?.();
          applyVolume(store.state.volume);
        }
      } catch {}
    }, 300);

    const d = player.getDuration?.() || 0;
    if (d > 0 && store.state.now?.id === curId && Math.abs((store.state.now.duration || 0) - d) > 1) {
      store.update((s) => { if (s.now?.id === curId) s.now.duration = Math.round(d); }, { remote: false });
    }
    return;
  }

  // 2. Faixa pausada (PAUSED)
  if (st === YT_STATE.PAUSED) {
    // Se o player pausou mas a faixa não foi pausada pelo bot/usuário e ainda não houve interação,
    // significa que o navegador pausou por restrição de autoplay com som. Retoma mutado e exibe o prompt.
    if (!store.state.now?.paused && !userInteracted) {
      console.warn('[alive widget] Pausado pelo navegador por autoplay policy. Retomando mutado e aguardando clique...');
      try {
        player.mute?.();
        player.playVideo?.();
      } catch {}
      showUnmutePrompt();
      return;
    }

    wasPaused = true;
    document.body.classList.add('paused');
    if (els.kicker) els.kicker.textContent = 'PAUSADO';
    writePosition(true);
    return;
  }

  // 3. Checagem de autoplay se estiver CUED ou UNSTARTED
  if (st === YT_STATE.CUED || st === YT_STATE.UNSTARTED) {
    checkAutoplay();
    return;
  }

  // 4. Faixa finalizada (ENDED)
  if (st === YT_STATE.ENDED) {
    const cur = Number(player?.getCurrentTime?.() || 0);
    const dur = Number(player?.getDuration?.() || durationShown || store.state.now?.duration || 0);

    // REGRA DE OURO ANTI-SKIP:
    // A fila SÓ avança se a música começou de fato (startChecked === true)
    // E o tempo atual chegou ao fim esperado da música (cur >= dur - 4s ou >= 85%).
    // Qualquer outro ENDED (aos 0s, transições ou phantom de troca de faixa) é estritamente ignorado.
    const finishedNaturally = startChecked && cur >= 5 && (
      (dur > 0 && cur >= dur - 4) ||
      (dur > 10 && cur >= dur * 0.85)
    );

    if (finishedNaturally) {
      console.log(`[alive widget] Faixa finalizada com sucesso (${Math.round(cur)}s/${Math.round(dur)}s). Avançando fila...`);
      startChecked = false;
      const targetId = curId;
      store.update((s) => {
        if (s.now && s.now.id === targetId) {
          advanceQueue(s);
        }
      });
      store.flush();
      return;
    }

    console.log(`[alive widget] ENDED transitório descartado (cur=${Math.round(cur)}s, dur=${Math.round(dur)}s, started=${startChecked})`);
    return;
  }
}

let resolvingError = false;
let consecutiveErrors = 0;

async function onPlayerError(ev) {
  const code = ev?.data;
  console.warn('[alive widget] YouTube onError:', code);
  const current = store.state.now;
  if (!current || !current.id || resolvingError) return;

  resolvingError = true;
  failedVideoIds.add(current.id);
  consecutiveErrors++;

  // Proteção contra skip contínuo: se 3 vídeos falharem seguidos, pausa a fila para não queimar as músicas
  if (consecutiveErrors >= 3) {
    console.warn('[alive widget] Múltiplos erros consecutivos no YouTube. Pausando a reprodução por segurança.');
    showToast('Aviso: Múltiplas faixas com reprodução restrita no YouTube. Fila pausada.');
    store.update((st) => {
      if (st.now) st.now.paused = true;
      pushLog(st, 'error', 'Fila pausada automaticamente após falhas de embed no YouTube');
    });
    store.flush();
    setTimeout(() => {
      resolvingError = false;
      consecutiveErrors = 0;
    }, 4000);
    return;
  }

  const msgMap = {
    2: 'Parâmetro inválido',
    5: 'Erro no player HTML5',
    100: 'Vídeo indisponível/privado',
    101: 'Restrito para embed pelo YouTube',
    150: 'Restrito para embed pelo YouTube',
    153: 'Restrito para embed pelo YouTube',
  };
  const desc = msgMap[code] || `Erro ${code}`;

  showToast(`Aviso: ${desc}. Buscando versão com áudio liberado...`);

  try {
    const cleanTitle = (current.title || '')
      .replace(/\(Official.*?\)/gi, '')
      .replace(/\[Official.*?\]/gi, '')
      .replace(/ft\..*$/gi, '')
      .replace(/feat\..*$/gi, '')
      .trim();
    const query = `${cleanTitle} audio`;
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=10`).then((r) => r.json()).catch(() => null);

    if (res && res.items && res.items.length) {
      const alt = res.items.find((it) => it.id !== current.id && !failedVideoIds.has(it.id));
      if (alt) {
        showToast(`Tocando versão liberada: ${alt.title}`);
        curId = alt.id;
        curStartedAt = Date.now();
        startChecked = false;
        stallCount = 0;
        stallAtEndCount = 0;

        store.update((st) => {
          if (st.now) {
            st.now.id = alt.id;
            st.now.title = alt.title;
            if (alt.thumb) st.now.thumb = alt.thumb;
            if (alt.duration) st.now.duration = alt.duration;
            st.now.position = 0;
            st.now.startedAt = curStartedAt;
            st.now.paused = false;
            pushLog(st, 'play', `Alternativa liberada: ${alt.title}`);
          }
        });
        store.flush();

        try {
          player?.loadVideoById(alt.id, 0);
          applyVolume(store.state.volume);
          player?.unMute?.();
          player?.playVideo?.();
        } catch (e) {
          console.warn('[alive widget] loadVideoById pós-erro falhou:', e);
        }

        setTimeout(() => { resolvingError = false; }, 3000);
        return;
      }
    }

    // Se nenhuma alternativa for encontrada, avisa e pula a faixa com folga visível de 3.5s
    showToast(`Faixa indisponível para streaming: ${current.title}. Pulando...`);
    setTimeout(() => {
      store.update((st) => {
        pushLog(st, 'skip', `Vídeo com erro (${desc}) pulado: ${current.title || current.id}`);
        advanceQueue(st);
      });
      store.flush();
      resolvingError = false;
    }, 3500);

  } catch (err) {
    console.warn('[alive widget] erro no tratamento de fallback:', err);
    setTimeout(() => {
      store.update((st) => { advanceQueue(st); });
      store.flush();
      resolvingError = false;
    }, 3500);
  }
}

function checkAutoplay() {
  if (startChecked || !ytReady || !player || !store.state.now) return;
  if (store.state.now.paused) return;
  try {
    if (!userInteracted) {
      player.mute?.();
    }
    player.playVideo?.();
  } catch { /* ignora */ }
  setTimeout(() => {
    if (startChecked || !store.state.now || store.state.now.paused) return;
    try {
      if (!userInteracted) {
        player.mute?.();
      }
      player.playVideo?.();
    } catch { /* ignora */ }
  }, 600);
}

const YT_STATE = { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5, UNSTARTED: -1 };

async function initPlayer() {
  try {
    const YT = await loadYTApi();
    const safeOrigin = getSafeOrigin();

    player = new YT.Player('yt', {
      host: 'https://www.youtube-nocookie.com',
      width: '100%',
      height: '100%',
      playerVars: {
        autoplay: 1,
        mute: 1,
        controls: 0,
        disablekb: 1,
        fs: 0,
        rel: 0,
        playsinline: 1,
        enablejsapi: 1,
        modestbranding: 1,
        iv_load_policy: 3,
        origin: safeOrigin || (typeof location !== 'undefined' ? location.origin : undefined),
        widget_referrer: (typeof location !== 'undefined' ? location.href : undefined),
      },
      events: {
        onReady: (ev) => {
          ytReady = true;
          try {
            const iframe = ev?.target?.getIframe?.();
            if (iframe) {
              iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
            }
          } catch {}
          applyConfig(store.state);
          loadCurrent(store.state);
          checkAutoplay();
        },
        onStateChange: onPlayerStateChange,
        onError: onPlayerError,
      },
    });
  } catch (e) {
    console.error('[alive widget] initPlayer:', e);
    showToast('Erro ao carregar player: ' + e.message);
  }
}

function writePosition(force = false) {
  const s = store.state;
  if (!s.now || !ytReady || !player || typeof player.getCurrentTime !== 'function') return;
  if (s.now.id !== curId) return;

  const cur = Math.round(player.getCurrentTime() || 0);
  const now = Date.now();
  if (!force && (now - lastPosWrite < 20000 || Math.abs((s.now.position || 0) - cur) < 4)) return;

  lastPosWrite = now;
  store.update((st) => {
    if (st.now && st.now.id === curId) st.now.position = cur;
  }, { remote: force });
}

function tick() {
  const now = store.state.now;
  if (!now) {
    els.fill.style.width = '0%';
    els.tcur.textContent = '0:00';
    els.tdur.textContent = '0:00';
    stallCount = 0;
    lastStallPos = -1;
    return;
  }

  let cur = 0;
  let dur = Number.isFinite(Number(durationShown || now.duration)) ? Math.max(0, Number(durationShown || now.duration)) : 0;
  let hasPlayerTime = false;

  if (ytReady && player && curId && typeof player.getCurrentTime === 'function') {
    try {
      const pCur = player.getCurrentTime();
      if (Number.isFinite(pCur)) {
        cur = Math.max(0, pCur);
        const realDur = player.getDuration?.();
        if (Number.isFinite(realDur) && realDur > 0) dur = realDur;
        hasPlayerTime = true;
      }
    } catch { /* ignora */ }
  }

  if (!hasPlayerTime) {
    if (!now.paused && now.startedAt) {
      cur = Math.min(dur || Infinity, (now.position || 0) + (Date.now() - now.startedAt) / 1000);
    } else {
      cur = now.position || 0;
    }
  }

  cur = Number.isFinite(cur) ? Math.max(0, cur) : 0;
  dur = Number.isFinite(dur) ? Math.max(0, dur) : 0;

  // Watchdog de término de vídeo: se o player atingiu o final (cur >= dur - 0.5) mas o evento ENDED não disparou no OBS
  if (!now.paused && ytReady && player && dur > 5 && cur >= dur - 0.5 && startChecked) {
    stallAtEndCount++;
    if (stallAtEndCount >= 6) { // 3 segundos parado no final
      stallAtEndCount = 0;
      console.log('[alive widget] Final do vídeo alcançado no tick (cur=' + Math.round(cur) + 's, dur=' + Math.round(dur) + 's). Avançando fila...');
      startChecked = false;
      const targetId = curId;
      store.update((s) => {
        if (s.now && s.now.id === targetId) {
          advanceQueue(s);
        }
      });
      store.flush();
      return;
    }
  } else {
    stallAtEndCount = 0;
  }

  // Watchdog contra congelamento no OBS: se o player estiver despausado mas travado no mesmo segundo por > 35s
  if (!now.paused && ytReady && player && startChecked) {
    const roundedCur = Math.floor(cur);
    if (roundedCur === lastStallPos) {
      stallCount++;
      if (stallCount >= 70) { // 70 ticks * 500ms = 35 segundos travado
        stallCount = 0;
        console.warn('[alive widget] Watchdog: vídeo travado no player. Buscando alternativa ou avançando...');
        onPlayerError({ data: 5 });
      }
    } else {
      stallCount = 0;
      lastStallPos = roundedCur;
    }
  } else {
    stallCount = 0;
  }

  const pct = dur > 0 ? Math.min(100, Math.max(0, (cur / dur) * 100)) : 0;
  els.fill.style.width = pct.toFixed(1) + '%';
  els.tcur.textContent = fmtTime(Math.floor(cur));
  els.tdur.textContent = fmtTime(Math.floor(dur));
}

function showToast(text) {
  els.toast.textContent = text;
  els.toast.hidden = false;
  clearTimeout(els.toast._t);
  els.toast._t = setTimeout(() => { els.toast.hidden = true; }, 4000);
}

// ----------------------------------------------------------------- listeners
store.subscribe((s) => {
  applyConfig(s);

  if (s.now && (s.now.id !== curId || (s.now.startedAt && s.now.startedAt !== curStartedAt))) {
    loadCurrent(s);
  } else if (!s.now && curId) {
    curId = null;
    curStartedAt = 0;
    try { player?.stopVideo?.(); } catch { /* ignora */ }
  } else if (s.now) {
    const paused = !!s.now.paused;
    if (paused && !wasPaused) {
      writePosition(true);
      try { player?.pauseVideo?.(); } catch { /* ignora */ }
    } else if (!paused && wasPaused) {
      try {
        const p = s.now.position || 0;
        if (player && Math.abs((player.getCurrentTime?.() || 0) - p) > 3) player.seekTo(p, true);
        player?.playVideo?.();
      } catch { /* ignora */ }
    }
    wasPaused = paused;
  } else {
    curId = null;
    wasPaused = false;
  }

  applyVolume(s.volume);
  render(s);
});

// ------------------------------------------------------------------- start
if (typeof window !== 'undefined') {
  applyConfig(store.state);
  render(store.state);
  store.start();
  initPlayer();

  setInterval(tick, 500);
  setInterval(() => writePosition(false), 40000);
  window.addEventListener('beforeunload', () => writePosition(true));
  document.addEventListener('visibilitychange', () => { if (document.hidden) writePosition(true); });

  // Desbloqueia áudio instantaneamente em caso de clique ou interação na janela
  window.addEventListener('pointerdown', markUserInteracted, { passive: true });
  window.addEventListener('click', markUserInteracted, { passive: true });
  document.addEventListener('click', markUserInteracted, { passive: true });
  window.addEventListener('keydown', markUserInteracted, { passive: true });
  window.addEventListener('touchstart', markUserInteracted, { passive: true });
  document.getElementById('unmutePrompt')?.addEventListener('click', (e) => {
    e.stopPropagation();
    markUserInteracted();
  });
}
