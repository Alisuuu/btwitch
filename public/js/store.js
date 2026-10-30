// Alive Bot — sincronização de estado multi-usuário entre painel e widget.
// Camadas: BroadcastChannel/localStorage (instantâneo, mesmo navegador) -> API/Vercel KV (entre máquinas).
import { sanitize, defaultState, LS_STATE, LS_HEART, LS_SECRET } from './state.js';

const API = '/api/state';

function secretParam() {
  try {
    const s = localStorage.getItem(LS_SECRET) || '';
    return s ? 'k=' + encodeURIComponent(s) : '';
  } catch { return ''; }
}

function qs(params) {
  return params.filter(Boolean).join('&');
}

export class Store {
  constructor(opts = {}) {
    const rawCh = typeof opts === 'string' ? opts : (opts?.channel || '');
    this.channel = String(rawCh || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
    this.bcName = this.channel ? `alive-bot:${this.channel}` : 'alive-bot';
    this.lsKey = this.channel ? `alive.state:${this.channel}` : LS_STATE;

    this.state = this._loadLocal();
    this._subs = [];
    this._timer = null;
    this._inflight = false;
    this._dirty = false;
    this._poll = null;
    this._micro = null;

    this._setupBc();

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === this.lsKey && e.newValue) {
          try { this._adopt(sanitize(JSON.parse(e.newValue))); } catch { /* descarta */ }
        }
      });
      window.addEventListener('beforeunload', () => this.flush());
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => { if (document.hidden) this.flush(); });
    }
  }

  _setupBc() {
    try {
      if (this.bc) {
        this.bc.close();
        this.bc = null;
      }
      if ('BroadcastChannel' in window) {
        this.bc = new BroadcastChannel(this.bcName);
        this.bc.onmessage = (e) => {
          const m = e.data;
          if (m && m.type === 'state') this._adopt(m.state);
        };
      }
    } catch { this.bc = null; }
  }

  setChannel(ch) {
    const clean = String(ch || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (this.channel === clean && this.bc) return;
    this.channel = clean;
    this.bcName = clean ? `alive-bot:${clean}` : 'alive-bot';
    this.lsKey = clean ? `alive.state:${clean}` : LS_STATE;
    this._setupBc();
    this._saveLocal();
    this.pull({ force: true });
  }

  _loadLocal() {
    try {
      const t = localStorage.getItem(this.lsKey);
      if (t) return sanitize(JSON.parse(t));
    } catch { /* estado corrompido */ }
    const def = defaultState();
    if (this.channel) def.config.channel = this.channel;
    return sanitize(def);
  }

  _saveLocal() {
    try {
      const ser = JSON.stringify(this.state);
      localStorage.setItem(this.lsKey, ser);
      if (!this.channel) {
        localStorage.setItem(LS_STATE, ser);
      }
    } catch { /* quota */ }
  }

  subscribe(fn) {
    this._subs.push(fn);
    return () => { this._subs = this._subs.filter((f) => f !== fn); };
  }

  emit() {
    for (const fn of this._subs) {
      try { fn(this.state); } catch (e) { console.error('[alive] listener:', e); }
    }
  }

  _adopt(st) {
    if (!st || typeof st !== 'object') return;
    const prevNow = this.state.now || null;
    const nextNow = st.now || null;
    const newer = st.rev > this.state.rev ||
      (st.rev === this.state.rev && (st.updatedAt || 0) > (this.state.updatedAt || 0)) ||
      (!prevNow && !!nextNow) ||
      (!!prevNow && !nextNow) ||
      (nextNow && prevNow && (nextNow.id !== prevNow.id || (nextNow.startedAt && nextNow.startedAt !== prevNow.startedAt))) ||
      ((st.queue || []).length !== (this.state.queue || []).length) ||
      (Boolean(nextNow?.paused) !== Boolean(prevNow?.paused)) ||
      (Number(st.volume) !== Number(this.state.volume));
    if (!newer) return;
    this.state = sanitize(st);
    this._saveLocal();
    this.emit();
  }

  update(fn, { remote = true } = {}) {
    const next = sanitize(JSON.parse(JSON.stringify(this.state)));
    fn(next);
    if (remote) {
      next.rev = (this.state.rev | 0) + 1;
      next.updatedAt = Date.now();
    }
    this.state = next;
    this._saveLocal();
    if (this.bc) {
      try { this.bc.postMessage({ type: 'state', state: next }); } catch { /* ignora */ }
    }
    if (this.bcName !== 'alive-bot') {
      try {
        const gBc = new BroadcastChannel('alive-bot');
        gBc.postMessage({ type: 'state', state: next });
        gBc.close();
      } catch { /* ignora */ }
    }
    this.emit();
    if (remote) this._scheduleSave();
    return next;
  }

  _scheduleSave() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flush(), 400);
  }

  async flush() {
    clearTimeout(this._timer);
    this._timer = null;
    if (this._inflight) { this._dirty = true; return; }
    this._inflight = true;
    try {
      const q = qs([secretParam(), this.channel ? 'channel=' + encodeURIComponent(this.channel) : '']);
      const r = await fetch(API + (q ? '?' + q : ''), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ state: this.state, channel: this.channel }),
      });
      const j = await r.json().catch(() => null);
      if (j && j.state) this._adopt(j.state);
      else if (!r.ok) console.warn('[alive] sync HTTP', r.status);
    } catch (e) {
      console.warn('[alive] sync offline (tentaremos de novo):', e.message);
    } finally {
      this._inflight = false;
      if (this._dirty) { this._dirty = false; this._scheduleSave(); }
    }
  }

  async pull({ force = false } = {}) {
    try {
      const q = qs([
        force ? '' : 'since=' + this.state.rev,
        secretParam(),
        this.channel ? 'channel=' + encodeURIComponent(this.channel) : '',
        '_t=' + Date.now(),
      ]);
      const r = await fetch(`${API}?${q}`, { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json().catch(() => null);
      if (j && j.state) this._adopt(j.state);
    } catch { /* offline */ }
  }

  // Inicia sincronização: pull imediato (forçado) + polling + micro-sync local.
  start({ poll } = {}) {
    let lastPull = 0;

    this.pull({ force: true });
    clearInterval(this._poll);
    this._poll = setInterval(() => {
      // Se a fila estiver vazia ou sem música tocando, poll rápido de 2s para entrar imediatamente
      const isIdle = !this.state.now || !this.state.queue.length;
      const wait = poll || (isIdle ? 2000 : Math.max(2, Number(this.state.config.pollInterval) || 3) * 1000);
      if (Date.now() - lastPull >= wait) {
        lastPull = Date.now();
        this.pull({ force: isIdle });
      }
    }, 1000);

    clearInterval(this._micro);
    this._micro = setInterval(() => {
      try { localStorage.setItem(LS_HEART, String(Date.now())); } catch { /* ignora */ }
      try {
        const t = localStorage.getItem(this.lsKey);
        if (t) {
          const st = sanitize(JSON.parse(t));
          if (st.rev > this.state.rev || (!this.state.now && !!st.now) || (st.now && this.state.now && st.now.id !== this.state.now.id)) {
            this._adopt(st);
          }
        }
      } catch { /* ignora */ }
    }, 1500);

    // aba oculta deixa timers lentos: puxa o estado forçado ao voltar a ficar visível
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this._onVis);
      this._onVis = () => { if (!document.hidden) this.pull({ force: true }); };
      document.addEventListener('visibilitychange', this._onVis);
    }
  }
}

export function createStore(channel = '') {
  return new Store(channel);
}
