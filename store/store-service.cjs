/* ==========================================================================
   ALIVE STORE — servidor da loja com storage NO TELEGRAM (zero disco)
   --------------------------------------------------------------------------
   Sem dependências externas (Node 18+, usa fetch global).

   STORAGE = GRUPO DO TELEGRAM
   ---------------------------
   O bot recebe o .zip (por mensagem no grupo/MP, ou por /api/upload),
   extrai em um diretório TEMPORÁRIO (apagado na hora), publica os assets
   no grupo e guarda SÓ METADADOS + file_id em server/index.json.
   Nada fica em disco no servidor: zips, imagens e vídeos vivem no Telegram
   e são servidos de lá sob demanda (cache em RAM, nunca em disco).

   ENDPOINTS
     GET    /                       → serve a loja (index.html)
     GET    /api/status             → bot, grupo, nº de temas
     GET    /api/themes             → temas que a loja consome
     GET    /api/themes/:id/preview → imagem de preview (do Telegram)
     GET    /api/themes/:id/asset/x → asset avulso (imagem, vídeo…) do Telegram
     GET    /api/themes/:id/download→ .zip original (do Telegram)
     GET    /api/themes/:id/info    → dados do theme.json
     POST   /api/themes/:id/notify  → reenvia o aviso no grupo
     POST   /api/upload?name=x.zip  → envia binário cru (alternativa ao grupo)
     POST   /api/reindex            → migra entradas antigas p/ storage Telegram
     POST   /api/send?text=oi       → manda texto no grupo
     GET    /api/discover           → força leitura do getUpdates
     DELETE /api/themes/:id         → apaga o tema (mensagens no grupo + índice)

   QUEM PODE PUBLICAR (cfg.allowedUsers / cfg.allowAnyMember)
     padrão: administradores do grupo. Vira "qualquer um" com allowAnyMember.
   ========================================================================== */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');

const ROOT = __dirname;
const CONFIG_PATH = path.join(ROOT, 'server', 'config.json');
const INDEX_PATH = path.join(ROOT, 'server', 'index.json');
const TMP_ROOT = path.join(os.tmpdir(), 'alive-store');   // temporário, apagado
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';

const MEM_MAX = 48 * 1024 * 1024;   // cache em RAM (jamais em disco)
const MAX_ASSETS = 40;              // teto de arquivos publicados por tema

/* ---------------- config ---------------- */
function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fallback; }
}
function writeJson(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

const cfg = readJson(CONFIG_PATH, {}) || {};
const TOKEN = process.env.TELEGRAM_TOKEN || cfg.token || '';
const storeEnabled = !!TOKEN;
const API = TOKEN ? ('https://api.telegram.org/bot' + TOKEN) : '';
let chatId = process.env.TELEGRAM_CHAT_ID || cfg.chatId || '';

function saveConfig() {
  if (fs.existsSync(path.dirname(CONFIG_PATH))) {
    writeJson(CONFIG_PATH, Object.assign({}, cfg, { chatId: String(chatId) }));
  }
}

/* ---------------- índice local (só metadados) ---------------- */
let db = readJson(INDEX_PATH, { files: [] });
function saveDb() { writeJson(INDEX_PATH, db); }

/* ---------------- Telegram ---------------- */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function tg(method, fields, attempt) {
  if (!storeEnabled) {
    const err = new Error('TELEGRAM_TOKEN não configurado');
    err.code = 503;
    throw err;
  }
  attempt = attempt || 0;
  const entries = Object.entries(fields || {});
  const isMultipart = entries.some(([k, v]) => v && typeof v === 'object' && v.blob);

  let res;
  try {
    if (isMultipart) {
      const form = new FormData();
      for (const [k, v] of entries) {
        if (v && typeof v === 'object' && v.blob) form.append(k, v.blob, v.filename || 'file');
        else if (typeof v === 'object') form.append(k, JSON.stringify(v));
        else form.append(k, String(v));
      }
      res = await fetch(API + '/' + method, { method: 'POST', body: form });
    } else {
      res = await fetch(API + '/' + method, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields || {})
      });
    }
  } catch (e) {
    if (attempt < 3) {
      console.log('  … rede instável (' + e.message + '), tentando ' + method + ' de novo');
      await sleep(700 * (attempt + 1));
      return tg(method, fields, attempt + 1);
    }
    throw e;
  }

  const data = await res.json().catch(() => ({ ok: false, description: 'resposta inválida' }));
  if (!data.ok) {
    if (data.error_code === 429 && attempt < 4) {          // flood → espera
      const wait = ((data.parameters && data.parameters.retry_after) || 2) + 1;
      console.log('  … rate limit, aguardando ' + wait + 's');
      await sleep(wait * 1000);
      return tg(method, fields, attempt + 1);
    }
    const err = new Error(data.description || ('Telegram ' + method + ' falhou'));
    err.code = data.error_code;
    throw err;
  }
  return data.result;
}

async function getBot() { return tg('getMe'); }

async function discoverChat() {
  const updates = await tg('getUpdates', { timeout: 0, allowed_updates: JSON.stringify(['message']) });
  for (const u of updates) {
    const m = u.message;
    if (m && m.chat && (m.chat.type === 'group' || m.chat.type === 'supergroup')) {
      chatId = m.chat.id;
      saveConfig();
      return m.chat;
    }
  }
  return null;
}

/* ==========================================================================
   ARQUIVOS DO TELEGRAM — baixa sob demanda, guarda só em RAM
   ========================================================================== */
const mem = new Map();          // file_id → Buffer (LRU simples)
let memBytes = 0;

function memGet(fileId) {
  if (!mem.has(fileId)) return null;
  const buf = mem.get(fileId);
  mem.delete(fileId);           // reordena pro LRU
  mem.set(fileId, buf);
  return buf;
}
function memSet(fileId, buf) {
  mem.set(fileId, buf);
  memBytes += buf.length;
  while (memBytes > MEM_MAX && mem.size > 1) {
    const k = mem.keys().next().value;
    if (k === fileId) break;
    memBytes -= mem.get(k).length;
    mem.delete(k);
  }
}

/** Baixa um arquivo do Telegram pelo file_id (em RAM). */
async function tgFile(fileId) {
  const cached = memGet(fileId);
  if (cached) return cached;
  const file = await tg('getFile', { file_id: fileId });
  const res = await fetch('https://api.telegram.org/file/bot' + TOKEN + '/' + file.file_path);
  if (!res.ok) throw new Error('não baixou do Telegram: HTTP ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  memSet(fileId, buf);
  return buf;
}

/** Sobe um binário pro grupo (é o storage). */
async function sendToStorage(buffer, filename, replyTo, caption) {
  const target = storageChat();
  if (!target) throw new Error('grupo ainda não conectado (mande /start no grupo)');
  const msg = await tg('sendDocument', {
    chat_id: target,
    document: { blob: new Blob([buffer]), filename: path.basename(filename) },
    caption: caption || undefined,
    reply_to_message_id: replyTo || undefined
  });
  return msg;
}

function storageChat() {
  return chatId || null;
}

/* ==========================================================================
   EXTRAÇÃO — temporário, apagado na hora (zero disco)
   ========================================================================== */
function metaFromTheme(t) {
  return {
    themeId: t.id || t.themeId || t.theme_id || null,
    name: t.name || 'Sem nome',
    description: t.description || '',
    author: t.author || '',
    version: t.version || '1.0',
    preview_image: t.preview_image || '',
    target_profile: t.target_profile || '',
    standby: t.standby ? {
      enabled: !!t.standby.enabled,
      type: t.standby.type || '',
      file: t.standby.file || '',
      title: t.standby.title || '',
      subtitle: t.standby.subtitle || ''
    } : null,
    background: t.background ? { enabled: !!t.background.enabled, file: t.background.file || '' } : null,
    frame: t.frame ? {
      enabled: !!t.frame.enabled, file: t.frame.file || '',
      border_color: t.frame.border_color || '', border_width: t.frame.border_width
    } : null,
    viewport: t.viewport || null,
    widgets: (t.widgets || []).map(function (w) {
      return {
        name: w.name || 'Widget', type: w.type || 'image',
        file: w.file || '', width: w.width, height: w.height,
        x: w.normalized_x, y: w.normalized_y, scale: w.scale, opacity: w.opacity
      };
    }),
    widgetCount: (t.widgets || []).length
  };
}

function walk(dir, base, out) {
  base = base || dir;
  out = out || [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, base, out);
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

/**
 * Abre o zip num diretório temporário e devolve um "job" com tudo que a
 * loja precisa. Chamar job.cleanup() quando terminar (apaga o temp).
 */
function makeJob(buf, name) {
  fs.mkdirSync(TMP_ROOT, { recursive: true });
  const dir = fs.mkdtempSync(path.join(TMP_ROOT, 'z'));
  const zipPath = path.join(dir, path.basename(name));
  fs.writeFileSync(zipPath, buf);

  let theme = null;
  const errors = [];
  try {
    execFileSync('unzip', ['-o', '-q', zipPath, '-d', dir], { stdio: 'pipe' });
    const tj = path.join(dir, 'theme.json');
    if (fs.existsSync(tj)) {
      try { theme = metaFromTheme(JSON.parse(fs.readFileSync(tj, 'utf8'))); }
      catch (e) { errors.push('theme.json ilegível: ' + e.message); }
    } else {
      errors.push('sem theme.json (não é um tema Alive)');
    }
  } catch (e) {
    errors.push('zip inválido: ' + (e.stderr || e.message).toString().trim());
  }

  // todos os arquivos do tema (assets) — menos o zip e o theme.json
  const all = walk(dir).filter(f => f !== path.basename(zipPath) && f !== 'theme.json');
  const assets = all.slice(0, MAX_ASSETS);
  if (all.length > MAX_ASSETS) errors.push('mais de ' + MAX_ASSETS + ' arquivos: publicamos só os ' + MAX_ASSETS);

  return {
    dir: dir,
    theme: theme,
    errors: errors,
    assets: assets,                       // caminhos relativos dentro do zip
    size: buf.length,
    cleanup: function () {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
    }
  };
}

/* ==========================================================================
   PUBLICAÇÃO — manifesto no grupo + assets como documentos (o storage)
   ========================================================================== */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Manda mensagem sem deixar um erro de botão derrubar o aviso inteiro. */
async function sendSafe(fields) {
  try {
    return await tg('sendMessage', fields);
  } catch (e) {
    console.log('! sendMessage falhou (' + e.message + ') — tentando sem botão');
    const clean = Object.assign({}, fields);
    delete clean.reply_markup;
    return await tg('sendMessage', clean);
  }
}

function manifestLines(job, entryId) {
  const t = job.theme;
  if (!t) return null;
  return [
    '✅ <b>' + esc(t.name) + '</b> publicado na loja',
    'themeId: <code>' + (t.themeId || '—') + '</code>',
    'widgets: ' + t.widgetCount +
      (t.standby && t.standby.enabled ? ' · standby: ' + esc(t.standby.title) : ''),
    'autor: ' + esc(t.author || '—') + ' · v' + esc(t.version) +
      ' · ' + (job.size / 1048576).toFixed(1) + ' MB',
    'assets: ' + job.assets.length + ' arquivo(s) abaixo ⬇️'
  ];
}

/**
 * Publica um job: manda o manifesto respondendo quem enviou e joga TODOS os
 * assets do zip no grupo (é isso que vira o storage). Devolve metadados.
 */
async function publish(job, replyTo, manifestId) {
  const out = { assets: {}, assetMessageIds: [], errors: job.errors.slice() };
  const target = storageChat();
  if (!target) {
    out.errors.push('grupo não conectado — assets não publicados');
    return out;
  }
  // arquivo que não é tema: o próprio zip já é o storage, não desmontamos
  if (!job.theme || !job.dir) return out;

  let reply = manifestId || replyTo;
  for (const rel of job.assets) {
    const full = path.join(job.dir, rel);
    let buf;
    try { buf = fs.readFileSync(full); } catch (e) { continue; }
    try {
      const msg = await tg('sendDocument', {
        chat_id: target,
        document: { blob: new Blob([buf]), filename: path.basename(rel) },
        caption: rel,
        reply_to_message_id: reply || undefined
      });
      const doc = msg.document || msg.video || msg.audio || (msg.photo && msg.photo[msg.photo.length - 1]);
      if (doc && doc.file_id) {
        out.assets[rel] = {
          fileId: doc.file_id,
          size: buf.length,
          mime: doc.mime_type || (msg.video ? 'video/mp4' : null)
        };
        out.assetMessageIds.push(msg.message_id);
      }
    } catch (e) {
      out.errors.push('asset ' + rel + ': ' + e.message);
    }
  }
  return out;
}

/** Manifesto/aviso no grupo (uma mensagem por lote). */
async function sendManifest(job, replyTo, extra) {
  const lines = manifestLines(job);
  const text = lines
    ? lines.join('\n') + (extra ? '\n' + extra : '')
    : '📦 Arquivo indexado: ' + esc(job.name || 'arquivo') +
      (job.errors.length ? '\n⚠️ ' + job.errors.join('\n⚠️ ') : '');
  const pub = cfg.publicUrl;
  const kb = (pub && job.entryId)
    ? { inline_keyboard: [[{ text: '⬇️ Baixar tema', url: pub + '/api/themes/' + job.entryId + '/download' }]] }
    : null;
  try {
    return await sendSafe({
      chat_id: replyTo ? (replyTo.chatId || storageChat()) : storageChat(),
      text: text, parse_mode: 'HTML',
      reply_to_message_id: replyTo ? replyTo.messageId : undefined,
      reply_markup: kb ? JSON.stringify(kb) : undefined
    });
  } catch (e) {
    console.log('! manifesto não enviado: ' + e.message);
    return null;
  }
}

/* ==========================================================================
   INGESTÃO
   ========================================================================== */
let seq = 0;
function newId() {
  seq++;
  return 'f' + Date.now().toString(36) + seq.toString(36);
}

/**
 * Prepara (extrai em temp) e publica (manifesto + assets no grupo),
 * deduplica por themeId e salva o índice. Zero disco no final.
 */
async function ingest(buf, name, sourceMsg, zipFileId, opts) {
  opts = opts || {};
  const job = makeJob(buf, name);
  const entryId = newId();
  job.entryId = entryId;
  job.name = path.basename(name);

  const replyTo = sourceMsg
    ? { messageId: sourceMsg.message_id, chatId: sourceMsg.chat && sourceMsg.chat.id }
    : null;

  let manifest = null;
  try {
    manifest = await sendManifest(job, replyTo, opts.manifestExtra);
  } catch (e) { console.log('! manifesto: ' + e.message); }

  let pub;
  try {
    pub = await publish(job, replyTo && replyTo.messageId, manifest && manifest.message_id);
  } catch (e) {
    pub = { assets: {}, assetMessageIds: [], errors: job.errors.concat([e.message]) };
  }

  const entry = {
    id: entryId,
    name: job.name,
    kind: job.theme ? 'theme' : 'file',
    size: job.size,
    fileId: zipFileId || null,        // zip vive no Telegram
    ownedZip: !!opts.ownedZip,        // se NÓS mandamos o zip, dá pra apagar
    mime: 'application/zip',
    messageId: sourceMsg ? sourceMsg.message_id : null,
    manifestId: manifest ? manifest.message_id : null,
    uploadedAt: new Date().toISOString(),
    theme: job.theme,
    assets: pub.assets,               // { caminho: { fileId, size, mime } }
    assetMessageIds: pub.assetMessageIds,
    errors: pub.errors
  };

  // re-post do mesmo tema: SÓ substitui se for comprovadamente do MESMO AUTOR!
  // Protege o criador original contra substituição indevida por outros usuários.
  if (entry.theme) {
    const norm = s => String(s || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const entryName = norm(entry.theme.name);
    const entryAuthor = norm(entry.theme.author);
    const entryTid = entry.theme.themeId;

    const dup = db.files.find(f => {
      if (!f.theme) return false;
      const dupAuthor = norm(f.theme.author);

      // Se os autores forem diferentes, NUNCA substitui o tema de outro usuário!
      if (entryAuthor && dupAuthor && entryAuthor !== dupAuthor) return false;

      // Substitui se for o mesmo themeId (mesmo autor) OU (mesmo nome E mesmo autor)
      if (entryTid && f.theme.themeId && f.theme.themeId === entryTid && (!entryAuthor || entryAuthor === dupAuthor)) return true;
      if (entryName && norm(f.theme.name) === entryName && entryAuthor && entryAuthor === dupAuthor) return true;
      return false;
    });

    if (dup && dup.id !== entryId) {
      db.files = db.files.filter(f => f.id !== dup.id);
      cleanupMessages(dup).catch(function () {});
    }
  }

  db.files.unshift(entry);
  saveDb();
  job.cleanup();

  console.log('✔ ' + entry.name +
    (entry.theme ? '  [tema: ' + entry.theme.name + ', ' + entry.theme.widgetCount + ' widgets, ' +
      Object.keys(entry.assets).length + ' assets no grupo]' : '  [sem theme.json]'));
  entry.errors.forEach(x => console.log('   ! ' + x));
  return entry;
}

/** Apaga as mensagens que NÓS mandamos (assets/zip de uma entrada). */
async function cleanupMessages(entry) {
  if (!chatId) return;
  const ids = (entry.assetMessageIds || []).slice();
  if (entry.ownedZip && entry.messageId) ids.push(entry.messageId);
  for (const id of ids) {
    try { await tg('deleteMessage', { chat_id: chatId, message_id: id }); }
    catch (e) { /* mensagem pode já ter saído do grupo */ }
  }
}

/* ==========================================================================
   QUEM PODE PUBLICAR
   ========================================================================== */
async function canPublish(m) {
  if (cfg.allowAnyMember === true) return true;
  const uid = m.from && m.from.id;
  if (!uid) return false;
  const list = Array.isArray(cfg.allowedUsers) ? cfg.allowedUsers : [];
  if (list.indexOf(uid) !== -1) return true;

  if (m.chat && (m.chat.type === 'group' || m.chat.type === 'supergroup')) {
    try {
      const mem = await tg('getChatMember', { chat_id: m.chat.id, user_id: uid });
      return mem.status === 'creator' || mem.status === 'administrator';
    } catch (e) { return false; }
  }
  return false;   // MP de quem não está na lista
}

/* ==========================================================================
   LOTE — dá pra mandar vários zips de uma vez no grupo
   ========================================================================== */
let pending = [];
let flushTimer = null;
let flushing = false;

function scheduleFlush() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flushDocs, 1500);
}

async function flushDocs() {
  flushTimer = null;
  if (flushing) return;
  flushing = true;
  try {
    while (pending.length) {
      const batch = pending.splice(0, pending.length);
      console.log('↓ lote de ' + batch.length + ' arquivo(s)…');
      const done = [];
      for (const m of batch) {
        const label = (m.document && m.document.file_name) || 'arquivo';
        try {
          const buf = await tgFile(m.document.file_id);
          const entry = await ingest(buf, label, m, m.document.file_id, {});
          done.push(entry);
        } catch (err) {
          console.log('✖ ' + label + ': ' + err.message);
          try {
            await sendSafe({
              chat_id: m.chat.id,
              text: '❌ Não consegui processar <b>' + esc(label) + '</b>: ' + esc(err.message),
              parse_mode: 'HTML', reply_to_message_id: m.message_id
            });
          } catch (e) {}
        }
      }
      if (done.length > 1) {
        console.log('  lote publicado: ' + done.length + ' arquivo(s)');
      }
    }
  } finally {
    flushing = false;
  }
}

/* ---------------- comandos + updates ---------------- */
let updateOffset = Number(cfg.updateOffset || 0);

async function handleCommand(m) {
  const text = (m.text || '').trim();
  if (!/^\/(start|ajuda|help|status)\b/i.test(text)) return false;
  const who = (m.from && (m.from.first_name || m.from.username)) || 'você';
  const lines = [
    '👋 Olá, ' + esc(who) + '! Sou o storage da <b>Alive Store</b>.',
    '',
    '📦 Me mande o tema <code>.zip</code> (respondendo esta mensagem ou direto) que eu:',
    '  1. leio o <code>theme.json</code>',
    '  2. publico os <b>assets no grupo</b> (imagens, vídeos, standby)',
    '  3. respondo aqui com o resumo e a loja já mostra o tema',
    '',
    '♻️ Reenviar o mesmo tema <b>substitui</b> o anterior (não duplica).',
    '👥 Vários de uma vez pode — respondo tudo numa mensagem só.'
  ];
  try {
    await sendSafe({
      chat_id: m.chat.id, text: lines.join('\n'), parse_mode: 'HTML',
      reply_to_message_id: m.message_id
    });
  } catch (e) { console.log('! comando: ' + e.message); }
  return true;
}

async function pollLoop() {
  try {
    const updates = await tg('getUpdates', {
      timeout: 0,
      offset: updateOffset,
      allowed_updates: JSON.stringify(['message'])
    });
    for (const u of updates) {
      updateOffset = u.update_id + 1;
      const m = u.message;
      if (!m) continue;

      // grupo novo: grava o id e manda a âncora
      if (!chatId && m.chat && (m.chat.type === 'group' || m.chat.type === 'supergroup')) {
        chatId = m.chat.id;
        saveConfig();
        console.log('✔ grupo detectado: ' + (m.chat.title || '') + ' (' + chatId + ')');
        sendSafe({
          chat_id: chatId,
          text: '✅ <b>Storage da loja conectado</b>\n\n' +
            'Me mande o tema <code>.zip</code> respondendo ESTA mensagem.\n' +
            '(Para aceitar mensagem de qualquer membro, desative a privacidade: ' +
            '@BotFather → /setprivacy → <b>Disable</b>.)',
          parse_mode: 'HTML'
        }).catch(function (e) { console.log('! âncora: ' + e.message); });
      }

      if (await handleCommand(m)) continue;

      if (m.document) {
        const ok = await canPublish(m).catch(() => false);
        if (!ok) {
          sendSafe({
            chat_id: m.chat.id,
            text: '❌ Só <b>administradores</b> podem publicar na loja.',
            parse_mode: 'HTML', reply_to_message_id: m.message_id
          }).catch(function () {});
          continue;
        }
        pending.push(m);
      }
    }
    if (updates.length) { cfg.updateOffset = updateOffset; saveConfig(); }
    if (pending.length) scheduleFlush();
  } catch (e) /* rede instável: tenta de novo no próximo tick */ {}
}

/* ==========================================================================
   HTTP
   ========================================================================== */
function json(res, code, obj) {
  if (res.headersSent || res.writableEnded) return true;
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj, null, 2));
  return true;
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new Error('arquivo maior que ' + Math.round(limit / 1024 / 1024) + 'MB')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.gif': 'image/gif',
  '.zip': 'application/zip', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg'
};
function mimeOf(file) { return MIME[path.extname(file).toLowerCase()] || 'application/octet-stream'; }

/** Envia um Buffer com suporte a Range (vídeo). */
function sendBuffer(req, res, buf, mime, filename, maxAge) {
  const range = req.headers.range;
  const common = {
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=' + (maxAge || 3600)
  };
  if (filename) common['Content-Disposition'] = 'attachment; filename="' + filename + '"';

  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (m) {
      let start = m[1] ? parseInt(m[1], 10) : 0;
      let end = m[2] ? parseInt(m[2], 10) : buf.length - 1;
      if (isNaN(start) || start >= buf.length) {
        res.writeHead(416, Object.assign({ 'Content-Range': 'bytes */' + buf.length }, common));
        return res.end();
      }
      end = Math.min(end, buf.length - 1);
      res.writeHead(206, Object.assign({
        'Content-Type': mime,
        'Content-Range': 'bytes ' + start + '-' + end + '/' + buf.length,
        'Content-Length': end - start + 1
      }, common));
      return res.end(buf.subarray(start, end + 1));
    }
  }
  res.writeHead(200, Object.assign({ 'Content-Type': mime, 'Content-Length': buf.length }, common));
  res.end(buf);
  return true;
}

function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';
  if (rel.startsWith('/server/') || rel === '/store-service.cjs') {
    res.writeHead(403);
    res.end('403');
    return;
  }
  const full = path.normalize(path.join(ROOT, rel));
  if (!full.startsWith(ROOT)) { res.writeHead(403); res.end('403'); return; }
  fs.readFile(full, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404 — ' + rel); return; }
    res.writeHead(200, { 'Content-Type': mimeOf(full) });
    res.end(buf);
  });
}

function extractFromZipBuffer(zipBuf, targetFile) {
  const baseTarget = path.basename(targetFile);
  const tmpZip = path.join(TMP_ROOT, 'extract_' + Date.now() + '_' + Math.random().toString(36).slice(2) + '.zip');
  try {
    fs.mkdirSync(TMP_ROOT, { recursive: true });
    fs.writeFileSync(tmpZip, zipBuf);
    try {
      return execFileSync('unzip', ['-p', tmpZip, targetFile], { maxBuffer: 60 * 1024 * 1024, stdio: ['pipe', 'pipe', 'ignore'] });
    } catch (e1) {
      return execFileSync('unzip', ['-p', tmpZip, baseTarget], { maxBuffer: 60 * 1024 * 1024, stdio: ['pipe', 'pipe', 'ignore'] });
    }
  } catch (e) {
    return null;
  } finally {
    try { fs.rmSync(tmpZip, { force: true }); } catch (e) {}
  }
}

function findAsset(entry, rel) {
  if (!entry.assets) return null;
  const clean = decodeURIComponent(rel).replace(/\\/g, '/').replace(/^\/+/, '');
  if (entry.assets[clean]) return entry.assets[clean];
  const base = path.basename(clean);
  for (const k of Object.keys(entry.assets)) {
    if (path.basename(k) === base) return entry.assets[k];
  }
  return null;
}

const STORE_API_EXACT = new Set([
  '/api/proxy-image',
  '/api/status',
  '/api/discover',
  '/api/send',
  '/api/upload',
  '/api/reindex',
  '/api/themes',
]);

function isStoreApiPath(p) {
  return STORE_API_EXACT.has(p) || p.startsWith('/api/themes/');
}

/* ---------------- rotas ---------------- */
async function handleStoreRequest(req, res, u) {
  const p = u.pathname;

  if (p === '/store') {
    res.writeHead(301, { Location: '/store/' + (u.search || '') });
    res.end();
    return true;
  }

  if (p.startsWith('/store/')) {
    serveStatic(req, res, p.slice('/store'.length));
    return true;
  }

  if (!isStoreApiPath(p)) {
    return false;
  }

  await handleStoreApi(req, res, u, p);
  return true;
}

async function handleStoreApi(req, res, u, p) {
  try {
    if (p === '/api/proxy-image') {
      const targetUrl = u.searchParams.get('url');
      if (!targetUrl || (!targetUrl.startsWith('https://image.tmdb.org/') && !targetUrl.startsWith('http://image.tmdb.org/'))) {
        json(res, 400, { error: 'url inválida ou não autorizada' });
        return true;
      }
      try {
        const memKey = 'img:' + targetUrl;
        let buf = memGet(memKey);
        let mime = 'image/png';
        if (!buf) {
          const r = await fetch(targetUrl);
          if (!r.ok) return json(res, 404, { error: 'imagem não encontrada' });
          buf = Buffer.from(await r.arrayBuffer());
          mime = r.headers.get('content-type') || (targetUrl.endsWith('.jpg') || targetUrl.endsWith('.jpeg') ? 'image/jpeg' : 'image/png');
          memSet(memKey, buf);
        }
        res.writeHead(200, {
          'Content-Type': mime,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=86400'
        });
        return res.end(buf);
      } catch (e) {
        return json(res, 502, { error: e.message });
      }
    }

    if (p === '/health' || p === '/api/health') {
      return json(res, 200, { ok: true, status: 'healthy', uptime: process.uptime() });
    }

    if (p === '/api/status') {
      const bot = await getBot();
      return json(res, 200, {
        bot: '@' + bot.username, botName: bot.first_name,
        chatId: chatId || null, chatReady: !!chatId,
        storage: 'telegram',
        diskBytes: 0,
        ramCacheBytes: memBytes,
        files: db.files.length,
        themes: db.files.filter(f => f.kind === 'theme').length,
        assets: db.files.reduce((s, f) => s + Object.keys(f.assets || {}).length, 0),
        allowAnyMember: cfg.allowAnyMember === true,
        root: ROOT
      });
    }

    if (p === '/api/discover') {
      const chat = await discoverChat();
      return json(res, 200, { found: !!chat, chatId: chatId || null, chat: chat || null });
    }

    if (p === '/api/send' && req.method === 'POST') {
      if (!chatId) return json(res, 400, { error: 'chatId não definido' });
      const text = u.searchParams.get('text') || 'teste';
      const msg = await tg('sendMessage', { chat_id: chatId, text });
      return json(res, 200, { ok: true, messageId: msg.message_id });
    }

    if (p === '/api/upload' && req.method === 'POST') {
      const name = path.basename(u.searchParams.get('name') || ('arquivo-' + Date.now() + '.bin'));
      const body = await readBody(req, 50 * 1024 * 1024);   // limite do bot: 50MB
      if (!body.length) return json(res, 400, { error: 'corpo vazio' });
      if (!chatId) return json(res, 503, { error: 'grupo não conectado — mande /start no grupo antes' });

      // o zip também vai pro grupo (é o storage); depois publica os assets
      let zipFileId = null, zipMsgId = null;
      try {
        const msg = await sendToStorage(body, name, null, '📦 ' + name);
        zipFileId = msg.document && msg.document.file_id;
        zipMsgId = msg.message_id;
      } catch (e) {
        return json(res, 502, { error: 'não consegui guardar o zip no grupo: ' + e.message });
      }

      const entry = await ingest(body, name, null, zipFileId, { ownedZip: true });
      if (zipMsgId) { entry.messageId = zipMsgId; saveDb(); }
      return json(res, 200, {
        ok: true, file: entry, theme: entry.theme, errors: entry.errors,
        assets: Object.keys(entry.assets),
        url: '/api/themes/' + entry.id
      });
    }

    if (p === '/api/reindex' && req.method === 'POST') {
      // migra entradas antigas (que tinham arquivo em disco) pro Telegram
      const report = [];
      for (const f of db.files) {
        try {
          let buf = null;
          if (f.fileId) buf = await tgFile(f.fileId);
          else if (f.zipPath && fs.existsSync(f.zipPath)) buf = fs.readFileSync(f.zipPath);
          if (!buf) { report.push(f.id + ': sem zip'); continue; }

          if (!f.fileId) {                       // zip nunca foi pro grupo
            const msg = await sendToStorage(buf, f.name, null, '📦 ' + f.name);
            f.fileId = msg.document && msg.document.file_id;
            f.messageId = msg.message_id;
            f.ownedZip = true;
          }

          const job = makeJob(buf, f.name);
          const manifest = await sendManifest(job, null);
          const pub = await publish(job, null, manifest && manifest.message_id);
          f.theme = job.theme;
          f.errors = pub.errors;
          f.assets = pub.assets;
          f.assetMessageIds = pub.assetMessageIds;
          f.manifestId = manifest ? manifest.message_id : null;
          f.kind = job.theme ? 'theme' : 'file';
          job.cleanup();
          if (f.zipPath) { try { fs.rmSync(path.dirname(f.zipPath), { recursive: true, force: true }); } catch (e) {} }
          f.zipPath = null;
          report.push(f.id + ': ' + Object.keys(f.assets).length + ' assets');
        } catch (e) {
          report.push(f.id + ': ERRO ' + e.message);
        }
      }
      saveDb();
      // limpa o diretório de cache antigo, se sobrou vazio
      try {
        const cache = path.join(ROOT, 'server', 'cache');
        if (fs.existsSync(cache) && walk(cache).length === 0) fs.rmSync(cache, { recursive: true, force: true });
      } catch (e) {}
      return json(res, 200, { ok: true, report: report });
    }

    /* ---------------- TEMAS (o que a loja consome) ---------------- */
    if (p === '/api/themes' && req.method === 'GET') {
      const themes = db.files.filter(f => f.kind === 'theme' && f.theme).map(f => {
        const assetBase = '/api/themes/' + f.id + '/asset/';
        const assetUrl = (file) => {
          if (!file) return null;
          const clean = String(file).replace(/\\/g, '/').replace(/^\/+/, '');
          return assetBase + clean.split('/').map(encodeURIComponent).join('/');
        };
        const standbyUrl = (f.theme.standby && f.theme.standby.enabled && f.theme.standby.file)
          ? assetUrl(f.theme.standby.file)
          : null;
        return {
          id: f.id,
          name: f.theme.name,
          description: f.theme.description,
          author: f.theme.author,
          version: f.theme.version,
          size: f.size,
          uploadedAt: f.uploadedAt,
          widgetCount: f.theme.widgetCount,
          widgets: (f.theme.widgets || []).map(w => Object.assign({}, w, { url: assetUrl(w.file) })),
          standby: f.theme.standby,
          frame: f.theme.frame,
          background: f.theme.background,
          viewport: f.theme.viewport,
          target_profile: f.theme.target_profile,
          themeId: f.theme.themeId,
          standbyUrl: standbyUrl,
          assetBase: assetBase,
          preview_image: f.theme.preview_image || '',
          previewUrl: assetUrl(f.theme.preview_image) || null,
          downloadUrl: '/api/themes/' + f.id + '/download',
          infoUrl: '/api/themes/' + f.id,
          assetCount: Object.keys(f.assets || {}).length
        };
      });
      return json(res, 200, { count: themes.length, themes: themes });
    }

    /* reenvia o aviso do tema no grupo */
    if (/^\/api\/themes\/[^/]+\/notify$/.test(p) && req.method === 'POST') {
      const entry = db.files.find(f => f.id === p.split('/')[3]);
      if (!entry) return json(res, 404, { error: 'tema não encontrado' });
      if (!chatId) return json(res, 400, { error: 'grupo ainda não detectado' });
      try {
        const job = {
          theme: entry.theme,
          assets: Object.keys(entry.assets || {}),
          size: entry.size,
          errors: entry.errors || [],
          entryId: entry.id,
          name: entry.name
        };
        const msg = await sendManifest(job, null);
        return json(res, 200, {
          ok: true, sentTo: chatId,
          messageId: msg ? msg.message_id : null,
          theme: entry.theme ? entry.theme.name : null,
          assets: job.assets.length
        });
      } catch (e) {
        return json(res, 502, { ok: false, error: e.message, code: e.code || null });
      }
    }

    /* apaga o tema: mensagens no grupo + índice */
    if (/^\/api\/themes\/[^/]+$/.test(p) && req.method === 'DELETE') {
      const id = p.split('/')[3];
      const entry = db.files.find(f => f.id === id);
      if (!entry) return json(res, 404, { error: 'tema não encontrado' });
      await cleanupMessages(entry);
      if (entry.manifestId && chatId) {
        try { await tg('deleteMessage', { chat_id: chatId, message_id: entry.manifestId }); } catch (e) {}
      }
      db.files = db.files.filter(f => f.id !== id);
      saveDb();
      return json(res, 200, { ok: true, removed: id });
    }

    /* assets extraídos → servidos direto do Telegram */
    const assetRoute = /^\/api\/themes\/([^/]+)\/asset\/(.+)$/.exec(p);
    if (assetRoute && req.method === 'GET') {
      const entry = db.files.find(f => f.id === assetRoute[1]);
      if (!entry) return json(res, 404, { error: 'tema não encontrado' });
      const asset = findAsset(entry, assetRoute[2]);
      if (asset && asset.fileId) {
        const buf = await tgFile(asset.fileId);
        return sendBuffer(req, res, buf, asset.mime || mimeOf(assetRoute[2]), null, 86400);
      }
      // Se não foi publicado individualmente no grupo (ex: standby.mp4 ou outro asset), extrai sob demanda do zip original no Telegram!
      if (entry.fileId) {
        const memKey = 'asset:' + entry.id + ':' + assetRoute[2];
        let buf = memGet(memKey);
        if (!buf) {
          const zipBuf = await tgFile(entry.fileId);
          buf = extractFromZipBuffer(zipBuf, decodeURIComponent(assetRoute[2]));
          if (buf) memSet(memKey, buf);
        }
        if (buf) {
          return sendBuffer(req, res, buf, mimeOf(assetRoute[2]), null, 86400);
        }
      }
      return json(res, 404, { error: 'asset não encontrado' });
    }

    const themeRoute = /^\/api\/themes\/([^/]+)(\/(preview|download|info))?$/.exec(p);
    if (themeRoute && req.method === 'GET') {
      const entry = db.files.find(f => f.id === themeRoute[1]);
      if (!entry) return json(res, 404, { error: 'tema não encontrado' });
      const kind = themeRoute[3];

      if (kind === 'preview') {
        const asset = entry.theme && entry.theme.preview_image
          ? findAsset(entry, entry.theme.preview_image) : null;
        if (!asset) return json(res, 404, { error: 'sem preview' });
        const buf = await tgFile(asset.fileId);
        return sendBuffer(req, res, buf, asset.mime || 'image/png', null, 3600);
      }

      if (kind === 'download') {
        if (!entry.fileId) return json(res, 404, { error: 'zip indisponível' });
        const buf = await tgFile(entry.fileId);
        return sendBuffer(req, res, buf, 'application/zip', entry.name, 3600);
      }

      if (kind === 'info') {
        if (!entry.theme) return json(res, 404, { error: 'sem theme.json' });
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(JSON.stringify(entry.theme, null, 2));
      }

      return json(res, 200, {
        id: entry.id, name: entry.name, size: entry.size, uploadedAt: entry.uploadedAt,
        mime: entry.mime, kind: entry.kind, errors: entry.errors || [],
        theme: entry.theme,
        assets: Object.keys(entry.assets || {}),
        previewUrl: entry.theme && entry.theme.preview_image
          ? '/api/themes/' + entry.id + '/asset/' + encodeURIComponent(entry.theme.preview_image) : null,
        downloadUrl: '/api/themes/' + entry.id + '/download'
      });
    }

    if (p.startsWith('/api/')) {
      json(res, 404, { error: 'rota desconhecida' });
      return true;
    }

    serveStatic(req, res, p);
    return true;
  } catch (e) {
    json(res, e.code === 503 ? 503 : 500, { error: e.message, code: e.code || null });
    return true;
  }
}

let pollTimer = null;

function getStoreStatus() {
  return {
    enabled: storeEnabled,
    chatReady: !!chatId,
    themes: db.files.filter(f => f.kind === 'theme').length,
    files: db.files.length,
  };
}

/* ---------------- boot ---------------- */
async function initStore() {
  if (!storeEnabled) {
    console.log('! [store] TELEGRAM_TOKEN não configurado — loja ativa apenas em modo estático');
    return;
  }

  try {
    const bot = await getBot();
    console.log('✔ [store] bot conectado: @' + bot.username + ' (' + bot.first_name + ')');
  } catch (e) {
    console.error('✖ [store] token inválido ou sem internet (loja seguirá sem polling):', e.message);
    return;
  }

  if (!chatId) {
    console.log('! [store] grupo ainda não conectado — mande /start no grupo do bot');
  } else {
    console.log('✔ [store] storage: grupo ' + chatId + ' (Telegram, zero disco)');
  }
  console.log('✔ [store] índice: ' + db.files.length + ' entrada(s) · ' +
    db.files.reduce((s, f) => s + Object.keys(f.assets || {}).length, 0) + ' asset(s) com file_id');

  // limpa sobras de versões antigas que gravavam em disco
  try {
    const cache = path.join(ROOT, 'server', 'cache');
    if (fs.existsSync(cache) && walk(cache).length === 0) fs.rmSync(cache, { recursive: true, force: true });
  } catch (e) {}
  try { fs.rmSync(TMP_ROOT, { recursive: true, force: true }); } catch (e) {}

  if (!pollTimer) {
    pollTimer = setInterval(pollLoop, 2500);
    pollLoop();
  }
}

module.exports = {
  initStore,
  handleStoreRequest,
  getStoreStatus,
};
