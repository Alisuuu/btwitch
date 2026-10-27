// Servidor local do Alive Bot — serve o site, as APIs e o Bot nativo da Twitch.
// Uso: node server.js  ->  http://localhost:3000
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { botService } from './lib/irc-bot.js';
import { discordGateway } from './lib/discord-gateway.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

// Carregamento simples de .env sem dependências externas
async function loadEnv() {
  try {
    const raw = await fs.readFile(path.join(ROOT, '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq > 0) {
        const k = trimmed.slice(0, eq).trim();
        const v = trimmed.slice(eq + 1).trim().replace(/^['"](.*)['"]$/, '$1');
        if (!process.env[k]) process.env[k] = v;
      }
    }
  } catch { /* sem arquivo .env */ }
}

await loadEnv();
const PORT = Number(process.env.PORT) || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 2_000_000) throw new Error('body muito grande');
    chunks.push(c);
  }
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  try { return JSON.parse(raw); } catch { return { _raw: raw }; }
}

async function handleApi(req, res, url) {
  const rel = url.pathname.replace(/^\/api\/?/, '').replace(/\.js$/, '');
  const file = path.join(ROOT, 'api', rel + '.js');
  if (!file.startsWith(path.join(ROOT, 'api'))) return false;

  try {
    await fs.access(file);
  } catch {
    json(res, 404, { error: 'not found' });
    return true;
  }

  try {
    const mod = await import(pathToFileURL(file).href + `?v=${Date.now()}`);
    const handler = mod.default;
    if (typeof handler !== 'function') {
      json(res, 500, { error: 'sem handler' });
      return true;
    }
    const q = {};
    for (const [k, v] of url.searchParams) q[k] = v;

    // Shim estilo Vercel (req.query / req.body / res.status / res.json)
    const reqShim = { ...req, method: req.method, query: q, body: await readBody(req), headers: req.headers, url: req.url };
    let sent = false;
    const resShim = {
      setHeader: (k, v) => res.setHeader(k, v),
      status(code) { res.statusCode = code; return resShim; },
      json(obj) { sent = true; json(res, res.statusCode || 200, obj); return resShim; },
      end(txt) { sent = true; res.end(txt); return resShim; },
    };
    await handler(reqShim, resShim);
    if (!sent) res.end();
  } catch (e) {
    console.error('[alive] erro na function:', e);
    json(res, 500, { error: e.message });
  }
  return true;
}

async function serveStatic(res, urlPath) {
  let p = decodeURIComponent(urlPath).replace(/^\/+/, '');
  if (!p) p = 'index.html';

  const candidates = [
    path.join(ROOT, p),
    path.join(ROOT, 'public', p),
    path.join(ROOT, p + '.html'),
    path.join(ROOT, 'public', p + '.html'),
    path.join(ROOT, p, 'index.html'),
    path.join(ROOT, 'public', p, 'index.html'),
  ];

  let found = null;
  for (const c of candidates) {
    const full = path.normalize(c);
    if (!full.startsWith(ROOT)) continue;
    try {
      const st = await fs.stat(full);
      if (st.isFile()) { found = full; break; }
    } catch { /* continua */ }
  }

  if (found) {
    try {
      const buf = await fs.readFile(found);
      res.statusCode = 200;
      res.setHeader('Content-Type', MIME[path.extname(found).toLowerCase()] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.end(buf);
      return;
    } catch { /* erro de leitura */ }
  }

  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end('404 — não encontrado: ' + urlPath);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname === '/health') {
      return json(res, 200, {
        status: 'ok',
        uptime: process.uptime(),
        bot: botService?.connected ? 'online' : (botService?.running ? 'connecting' : 'offline'),
        discord: discordGateway?.connected ? 'online' : 'disabled',
        channels: botService ? Array.from(botService.channels) : [],
      });
    }
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      const done = await handleApi(req, res, url);
      if (done) return;
    }
    await serveStatic(res, url.pathname);
  } catch (e) {
    console.error(e);
    json(res, 500, { error: e.message });
  }
});

server.listen(PORT, async () => {
  await botService.init();
  if (process.env.DISCORD_BOT_TOKEN) {
    discordGateway.start();
  }
  if (process.env.TWITCH_CHANNEL || (botService.channel && process.env.AUTO_START_BOT === '1')) {
    botService.start();
    console.log(`     Bot Twitch conectado em #${botService.channel}`);
  }
  console.log(`\n  Alive Bot rodando em  http://localhost:${PORT}`);
  console.log(`     Painel:  http://localhost:${PORT}/`);
  console.log(`     Widget:  http://localhost:${PORT}/widget`);
  console.log(`     API Bot: http://localhost:${PORT}/api/bot\n`);
});
