// Alive Bot — armazenamento do estado no servidor multi-usuário (Vercel KV > Blob > arquivo > memória).
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { sanitize, defaultState } from '../js/state.js';

const KEY = 'alive-state';
const BLOB_URL = 'https://blob.vercel-storage.com/alive-state';
const memory = (globalThis.__aliveStore = globalThis.__aliveStore || { state: null, channels: {}, blobUrl: null });

const KVDB_BASE = 'https://kvdb.io/WFmviqxrR53HQjSYwnTmAQ';

function storeKey(ch) {
  return ch ? `state_${ch}` : 'state_default';
}

async function kvdbGet(ch) {
  try {
    const key = storeKey(ch);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3500);
    const r = await fetch(`${KVDB_BASE}/${encodeURIComponent(key)}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
      signal: ctrl.signal,
    }).finally(() => clearTimeout(t));
    if (r.ok) {
      const data = await r.json().catch(() => null);
      if (data && typeof data === 'object') return data;
    }
  } catch (e) {
    console.warn('[alive] kvdb GET:', e.message);
  }
  return null;
}

async function kvdbPut(ch, state) {
  try {
    const key = storeKey(ch);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch(`${KVDB_BASE}/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(t));
    return r.ok;
  } catch (e) {
    console.warn('[alive] kvdb PUT:', e.message);
    return false;
  }
}

async function edgeGet(ch) {
  return null;
}

async function edgePut(ch, state) {
  return false;
}

// Na Vercel e AWS Lambda, /var/task é somente-leitura. O diretório gravável oficial é os.tmpdir() (/tmp).
const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT);
const DATA_DIR = isServerless ? path.join(os.tmpdir(), 'alive-data') : path.join(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'state.json');

function cleanChannel(ch) {
  return String(ch || '').toLowerCase().replace(/[^a-z0-9_]/g, '').trim();
}

function resolveKey(ch) {
  return ch ? `alive-state:${ch}` : KEY;
}

function resolveFile(ch) {
  if (!ch) return FILE;
  return path.join(DATA_DIR, 'channels', `${ch}.json`);
}

function kvCreds() {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/+$/, ''), token } : null;
}

// Protocolo Upstash REST: tenta POST com array de comando e cai no formato de caminho.
async function kvCommand(kv, args) {
  try {
    const r = await fetch(kv.url, {
      method: 'POST',
      headers: { authorization: `Bearer ${kv.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(args),
    });
    if (r.ok) {
      const j = await r.json();
      if (j && 'result' in j) return j.result;
    }
  } catch { /* tenta o formato caminho */ }

  const [cmd, ...rest] = args;
  const p = `/${String(cmd).toLowerCase()}/${rest.map(encodeURIComponent).join('/')}`;
  const r2 = await fetch(kv.url + p, { headers: { authorization: `Bearer ${kv.token}` } });
  if (!r2.ok) throw new Error(`KV ${r2.status}`);
  const j2 = await r2.json();
  return j2 ? j2.result : null;
}

async function blobPut(state) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const r = await fetch(BLOB_URL, {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(state),
  });
  if (!r.ok) throw new Error(`Blob PUT ${r.status}`);
  const j = await r.json().catch(() => null);
  if (j && j.url) memory.blobUrl = j.url;
  return true;
}

async function blobGet() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const tries = [];
  if (memory.blobUrl) tries.push(memory.blobUrl);
  tries.push(BLOB_URL);
  for (const url of tries) {
    try {
      const r = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
      if (r.ok) {
        const txt = await r.text();
        if (txt && txt.trim().startsWith('{')) return JSON.parse(txt);
      }
    } catch { /* próxima tentativa */ }
  }
  return null;
}

export async function loadState(channel = '') {
  const ch = cleanChannel(channel);
  const key = resolveKey(ch);
  const file = resolveFile(ch);

  // 1. Memória recente (< 20s) para evitar I/O desnecessário
  if (ch && memory.channels && memory.channels[ch]) {
    const mem = memory.channels[ch];
    if (Date.now() - (mem.updatedAt || 0) < 20000) {
      return sanitize(mem);
    }
  }

  // 2. Arquivo local no servidor Node (leitura imediata < 1ms)
  try {
    const txt = await fs.readFile(file, 'utf8');
    if (txt.trim()) {
      const data = JSON.parse(txt);
      if (ch) {
        memory.channels = memory.channels || {};
        memory.channels[ch] = data;
      } else {
        memory.state = data;
      }
      return sanitize(data);
    }
  } catch { /* sem arquivo local */ }

  // 3. KVDB na nuvem com timeout rápido
  const kvdbVal = await kvdbGet(ch);
  if (kvdbVal) {
    if (ch) {
      memory.channels = memory.channels || {};
      memory.channels[ch] = kvdbVal;
    } else {
      memory.state = kvdbVal;
    }
    return sanitize(kvdbVal);
  }

  const kv = kvCreds();
  if (kv) {
    try {
      const v = await kvCommand(kv, ['GET', key]);
      if (v) return sanitize(typeof v === 'string' ? JSON.parse(v) : v);
    } catch (e) {
      console.error('[alive] KV leitura:', e.message);
    }
  }
  if (!ch && process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const v = await blobGet();
      if (v) return sanitize(v);
    } catch (e) {
      console.error('[alive] Blob leitura:', e.message);
    }
  }
  try {
    const txt = await fs.readFile(file, 'utf8');
    if (txt.trim()) return sanitize(JSON.parse(txt));
  } catch { /* sem arquivo ainda */ }

  if (ch) {
    if (memory.channels && memory.channels[ch]) return sanitize(memory.channels[ch]);
    const def = defaultState();
    def.config.channel = ch;
    return sanitize(def);
  }
  return sanitize(memory.state || defaultState());
}

export async function saveState(state, channel = '') {
  const ch = cleanChannel(channel);
  const key = resolveKey(ch);
  const file = resolveFile(ch);

  if (ch) {
    memory.channels = memory.channels || {};
    memory.channels[ch] = state;
  } else {
    memory.state = state;
  }

  // 1. Grava no arquivo local imediatamente
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(state), 'utf8');
  } catch (e) {
    console.error('[alive] arquivo local:', e.message);
  }

  // 2. Sincroniza com KVDB em segundo plano
  kvdbPut(ch, state).catch(() => {});

  // 3. Sincroniza com Vercel KV / Upstash Redis se configurado
  const kv = kvCreds();
  if (kv) {
    kvCommand(kv, ['SET', key, JSON.stringify(state)]).catch((e) => console.error('[alive] KV grava:', e.message));
  }
  return 'file';
}
