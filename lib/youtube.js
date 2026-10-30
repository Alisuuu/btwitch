// Alive Bot — leitura de dados do YouTube (busca, vídeo e playlist) via HTML público.
// Não usa API key nem download de áudio: só metadados para o widget tocar no player oficial.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export async function fetchYT(url) {
  // 1 tentativa extra em falha transitória (rede/429/5xx) — o scraping do YouTube é sensível.
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(url, {
        headers: {
          'user-agent': UA,
          'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
          cookie: 'SOCS=CAI', // evita a página de consentimento (EU)
        },
        signal: AbortSignal.timeout(10000),
      });
      if (r.ok) return await r.text();
      if (attempt === 0 && (r.status === 429 || r.status >= 500)) {
        await new Promise((res) => setTimeout(res, 800));
        continue;
      }
      throw new Error(`YouTube ${r.status}`);
    } catch (e) {
      if (attempt === 0 && !(e.name === 'AbortError' || e.name === 'TimeoutError')) {
        await new Promise((res) => setTimeout(res, 800));
        continue;
      }
      throw e;
    }
  }
}

// Extrai o primeiro objeto JSON balanceado que vem logo após algum marcador.
function extractJsonAfter(html, markers) {
  let start = -1;
  for (const m of markers) {
    const i = html.indexOf(m);
    if (i >= 0) { start = i + m.length; break; }
  }
  if (start < 0) return null;

  let depth = 0, begin = -1, inStr = false, esc = false;
  for (let p = start; p < html.length; p++) {
    const c = html[p];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '{') { if (depth === 0) begin = p; depth++; }
    else if (c === '}') {
      depth--;
      if (depth === 0 && begin >= 0) {
        try { return JSON.parse(html.slice(begin, p + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

// Extrai o objeto JSON de `var ytInitialData = {...}` com matching de chaves (respeita strings).
export function extractInitialData(html) {
  return extractJsonAfter(html, ['var ytInitialData = ', 'ytInitialData = ', 'window["ytInitialData"] = ']);
}

// Extrai `var ytInitialPlayerResponse = {...}` (duração, autor, status de reprodução).
export function extractPlayerResponse(html) {
  return extractJsonAfter(html, ['var ytInitialPlayerResponse = ', 'ytInitialPlayerResponse = ', 'window["ytInitialPlayerResponse"] = ']);
}

function textOf(x) {
  if (!x) return '';
  if (typeof x === 'string') return x;
  if (x.simpleText) return x.simpleText;
  if (Array.isArray(x.runs)) return x.runs.map((r) => r && r.text).join('');
  if (x.content) return textOf(x.content);
  return '';
}

function findDuration(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 5) return '';
  if (obj.lengthText) {
    const t = textOf(obj.lengthText);
    if (t) return t;
  }
  if (Array.isArray(obj)) {
    for (const v of obj) {
      const t = findDuration(v, depth + 1);
      if (t) return t;
    }
    return '';
  }
  for (const k in obj) {
    if (k === 'lengthText') continue;
    const v = obj[k];
    if (typeof v === 'string' && /^\d{1,2}:\d{2}(:\d{2})?$/.test(v)) return v;
    if (v && typeof v === 'object') {
      const t = findDuration(v, depth + 1);
      if (t) return t;
    }
  }
  return '';
}

function thumbOf(obj) {
  const lists = [
    obj.thumbnail?.thumbnails,
    obj.thumbnailViewModel?.image?.sources,
    obj.thumbnail?.image?.sources,
    obj.crop32ThumbnailViewModel?.image?.sources,
  ];
  for (const list of lists) {
    if (Array.isArray(list) && list.length) {
      const last = list[list.length - 1];
      if (last && last.url) return last.url;
    }
  }
  return '';
}

function ownerOf(obj) {
  return (
    textOf(obj.ownerText) ||
    textOf(obj.shortBylineText) ||
    textOf(obj.longBylineText) ||
    textOf(obj.detailedMetadataSnippets?.[0]?.snippetText) ||
    textOf(obj.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts?.[0]?.text) ||
    ''
  );
}

function titleOf(obj) {
  return (
    textOf(obj.title) ||
    textOf(obj.headline) ||
    textOf(obj.metadata?.lockupMetadataViewModel?.title) ||
    ''
  );
}

function secFrom(durationText) {
  if (!durationText) return 0;
  const parts = String(durationText).split(':').map((n) => Number(n));
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

const KINDS = ['videoRenderer', 'gridVideoRenderer', 'lockupViewModel', 'playlistVideoRenderer', 'compactVideoRenderer'];

// Busca em largura preservando a ordem do documento.
function collectVideos(data, { lockupOnlyVideo = false, skipCompact = false } = {}) {
  const out = [];
  const seen = new Set();
  const queue = [data];
  let guard = 0;

  while (queue.length && guard < 300000) {
    const node = queue.shift();
    guard++;
    if (!node || typeof node !== 'object') continue;

    if (!Array.isArray(node)) {
      for (const kind of KINDS) {
        if (skipCompact && kind === 'compactVideoRenderer') continue;
        const renderer = node[kind];
        if (renderer && typeof renderer === 'object') {
          const id = renderer.videoId || renderer.contentId;
          if (id && !seen.has(id)) {
            const isLockup = kind === 'lockupViewModel';
            if (isLockup && lockupOnlyVideo && renderer.contentType && renderer.contentType !== 'video') {
              // pula canais/playlists listados como lockup
            } else {
              const title = titleOf(renderer);
              if (title) {
                seen.add(id);
                out.push({
                  id: String(id),
                  title,
                  channel: ownerOf(renderer),
                  thumb: thumbOf(renderer) || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
                  durationText: textOf(renderer.lengthText) || findDuration(renderer),
                });
              }
            }
          }
        }
      }
    }

    if (Array.isArray(node)) {
      for (const v of node) queue.push(v);
    } else {
      for (const k in node) {
        const v = node[k];
        if (v && typeof v === 'object') queue.push(v);
      }
    }
  }
  return out;
}

function finish(items, limit) {
  return items
    .filter((i) => i.id && i.title)
    .slice(0, limit)
    .map((i) => ({
      id: i.id,
      title: i.title,
      channel: i.channel || '',
      thumb: i.thumb || `https://i.ytimg.com/vi/${i.id}/hqdefault.jpg`,
      duration: secFrom(i.durationText),
    }));
}

export async function searchVideos(query, limit = 12) {
  const url = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query);
  const html = await fetchYT(url);
  const data = extractInitialData(html);
  if (!data) return [];
  let items = collectVideos(data, { lockupOnlyVideo: true, skipCompact: true });
  if (!items.length) items = collectVideos(data);
  return finish(items, limit);
}

export function extractVideoId(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m =
    s.match(/[?&]v=([A-Za-z0-9_-]{11})/) ||
    s.match(/youtu\.be\/([A-Za-z0-9_-]{11})/) ||
    s.match(/\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

export function extractListId(raw) {
  if (!raw) return null;
  const m = String(raw).match(/[?&]list=([A-Za-z0-9_-]{10,})/);
  return m ? m[1] : null;
}

export async function videoMeta(id) {
  const fallbackThumb = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

  // 1. Página de watch: metadados completos (inclui duração) + validação de disponibilidade.
  try {
    const html = await fetchYT(`https://www.youtube.com/watch?v=${encodeURIComponent(id)}`);
    const pr = extractPlayerResponse(html);
    const vd = pr?.videoDetails;
    const status = pr?.playabilityStatus?.status;
    if (status === 'ERROR') return null; // apagado/privado/inexistente: não enfileira
    if (vd && vd.title) {
      const thumbs = Array.isArray(vd.thumbnail?.thumbnails) ? vd.thumbnail.thumbnails : [];
      const last = thumbs[thumbs.length - 1];
      return {
        id,
        title: vd.title,
        channel: vd.author || '',
        thumb: (last && last.url) || fallbackThumb,
        duration: Number(vd.lengthSeconds) || 0,
      };
    }
  } catch { /* tenta o fallback oEmbed */ }

  // 2. Fallback oEmbed (mais leve, sem duração). 404/400 = vídeo não existe.
  try {
    const url = `https://www.youtube.com/oembed?url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}&format=json`;
    const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(8000) });
    if (r.ok) {
      const j = await r.json();
      return { id, title: j.title || 'Vídeo ' + id, channel: j.author_name || '', thumb: j.thumbnail_url || fallbackThumb, duration: 0 };
    }
    if (r.status === 400 || r.status === 404) return null;
  } catch { /* sem metadados */ }

  // Sem confirmação de que o vídeo existe: devolve null em vez de enfileirar lixo.
  return null;
}

export async function playlistVideos(listId, limit = 20) {
  const html = await fetchYT('https://www.youtube.com/playlist?list=' + encodeURIComponent(listId));
  const data = extractInitialData(html);
  if (!data) return [];
  const items = collectVideos(data, { skipCompact: true });
  // Na página de playlist, os vídeos vêm de playlistVideoRenderer; garante a ordem da lista.
  const ordered = [];
  const seen = new Set();
  const queue = [data];
  let guard = 0;
  while (queue.length && guard < 300000) {
    const node = queue.shift();
    guard++;
    if (!node || typeof node !== 'object') continue;
    if (!Array.isArray(node) && node.playlistVideoRenderer) {
      const r = node.playlistVideoRenderer;
      const id = r.videoId;
      const title = textOf(r.title);
      if (id && title && !seen.has(id)) {
        seen.add(id);
        ordered.push({
          id: String(id),
          title,
          channel: textOf(r.shortBylineText),
          thumb: thumbOf(r) || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
          durationText: textOf(r.lengthText) || findDuration(r),
        });
      }
    }
    if (Array.isArray(node)) for (const v of node) queue.push(v);
    else for (const k in node) if (node[k] && typeof node[k] === 'object') queue.push(node[k]);
  }
  const base = ordered.length ? ordered : items;
  return finish(base, limit);
}
