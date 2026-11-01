import * as ytdlPkg from '@distube/ytdl-core';
import { Readable } from 'node:stream';

// Cache em memória de streams para evitar requisições repetidas ao YouTube
const audioCache = new Map();

let ytInstance = null;
function getYt() {
  if (!ytInstance) {
    const YtdlClass = ytdlPkg.Ytdl || (ytdlPkg.default && ytdlPkg.default.Ytdl);
    if (typeof YtdlClass === 'function') {
      try {
        // visionos é o cliente mais rápido e confiável que não exige cookies no datacenter
        ytInstance = new YtdlClass({ clients: ['visionos'] });
      } catch (err) {
        console.warn('[alive api/audio] erro ao criar Ytdl visionos:', err?.message || err);
        try {
          ytInstance = new YtdlClass();
        } catch {}
      }
    }
  }
  return ytInstance;
}

// Compatibilidade resiliente de exportações do @distube/ytdl-core com timeout generoso (30s)
async function getAudioInfo(url) {
  const fetchOp = async () => {
    const yt = getYt();
    if (yt && typeof yt.getInfo === 'function') {
      return await yt.getInfo(url);
    }
    if (typeof ytdlPkg.getInfo === 'function') {
      return await ytdlPkg.getInfo(url);
    }
    if (ytdlPkg.default && typeof ytdlPkg.default.getInfo === 'function') {
      return await ytdlPkg.default.getInfo(url);
    }
    if (typeof ytdlPkg.Ytdl === 'function') {
      const fresh = new ytdlPkg.Ytdl({ clients: ['visionos'] });
      return await fresh.getInfo(url);
    }
    throw new Error('Método getInfo não encontrado em @distube/ytdl-core');
  };

  const timer = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout ytdl')), 30000));
  return await Promise.race([fetchOp(), timer]);
}

const AUDIO_WITHOUT_VIDEO = (formats = []) => {
  const list = formats.filter((f) => f && f.url && (f.hasAudio || f.audioBitrate) && !f.hasVideo);
  if (list.length) {
    // Prioriza AAC / MP4 (itag 140 / 139) para suporte universal nativo (Android MediaPlayer, iOS, OBS, Chrome)
    const itag140 = list.find((f) => f.itag === 140);
    if (itag140) return itag140;
    const m4a = list.find((f) => (f.mimeType || '').includes('audio/mp4') || f.container === 'm4a');
    if (m4a) return m4a;
    list.sort((a, b) => (Number(b.bitrate || 0) || 0) - (Number(a.bitrate || 0) || 0));
    return list[0];
  }
  const fallback = formats.filter((f) => f && f.url && f.hasAudio);
  if (fallback.length) {
    const m4a = fallback.find((f) => (f.mimeType || '').includes('audio/mp4') || f.container === 'm4a');
    if (m4a) return m4a;
    fallback.sort((a, b) => (Number(b.bitrate || 0) || 0) - (Number(a.bitrate || 0) || 0));
    return fallback[0];
  }
  return null;
};

// Fallbacks de APIs públicas distribuídas caso o ytdl primário sofra bot-check
async function fetchFallbackAudio(id) {
  const endpoints = [
    `https://api.piped.private.coffee/streams/${id}`,
    `https://piped.video/api/v1/streams/${id}`,
    `https://inv.nadeko.net/api/v1/videos/${id}`,
    `https://invidious.nerdvpn.de/api/v1/videos/${id}`,
  ];
  const promises = endpoints.map(async (ep) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 7000);
    try {
      const resp = await fetch(ep, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: ctrl.signal,
      });
      if (!resp.ok) return null;
      const data = await resp.json().catch(() => null);
      if (!data) return null;

      const pipedList = data.audioStreams || [];
      if (pipedList.length) {
        const m4a = pipedList.find((f) => (f.mimeType || '').includes('audio/mp4') || f.format === 'M4A');
        if (m4a && m4a.url) {
          return {
            url: m4a.url,
            mimeType: m4a.mimeType || 'audio/mp4',
            bitrate: Number(m4a.bitrate || 0),
            duration: Number(data.duration || 0),
          };
        }
        pipedList.sort((a, b) => (Number(b.bitrate || 0) || 0) - (Number(a.bitrate || 0) || 0));
        const best = pipedList[0];
        if (best && best.url) {
          return {
            url: best.url,
            mimeType: best.mimeType || 'audio/webm',
            bitrate: Number(best.bitrate || 0),
            duration: Number(data.duration || 0),
          };
        }
      }

      const invFormats = (data.adaptiveFormats || []).filter((f) => f.type?.includes('audio') && f.url);
      if (invFormats.length) {
        const m4a = invFormats.find((f) => f.type?.includes('audio/mp4'));
        if (m4a) {
          return {
            url: m4a.url,
            mimeType: m4a.type || 'audio/mp4',
            bitrate: Number(m4a.bitrate || 0),
            duration: Number(data.lengthSeconds || 0),
          };
        }
        invFormats.sort((a, b) => (Number(b.bitrate || 0) || 0) - (Number(a.bitrate || 0) || 0));
        const best = invFormats[0];
        return {
          url: best.url,
          mimeType: best.type || 'audio/webm',
          bitrate: Number(best.bitrate || 0),
          duration: Number(data.lengthSeconds || 0),
        };
      }
      return null;
    } catch {
      return null;
    } finally {
      clearTimeout(t);
    }
  });

  try {
    const results = await Promise.allSettled(promises);
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value && r.value.url) return r.value;
    }
  } catch {}
  return null;
}

async function pipeAudioStream(req, res, targetUrl) {
  try {
    const upstream = await fetch(targetUrl, {
      headers: {
        ...(req.headers?.range ? { range: req.headers.range } : {}),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
    });

    res.status(upstream.status);
    for (const [k, v] of upstream.headers) {
      if (['content-type', 'content-length', 'content-range', 'accept-ranges'].includes(k.toLowerCase())) {
        res.setHeader(k, v);
      }
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    const rawRes = res.raw || res;
    if (upstream.body) {
      if (typeof Readable.fromWeb === 'function') {
        const stream = Readable.fromWeb(upstream.body);
        rawRes.on('close', () => { try { stream.destroy(); } catch {} });
        stream.pipe(rawRes);
      } else {
        const reader = upstream.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          rawRes.write(value);
        }
        rawRes.end();
      }
    } else {
      rawRes.end();
    }
    return true;
  } catch (err) {
    console.warn('[alive api/audio] erro no pipe de streaming:', err?.message || err);
    return false;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const id = String(req.query?.id || req.query?.v || '').trim();
  if (!id || !/^[a-zA-Z0-9_-]{10,13}$/.test(id)) {
    return res.status(400).json({ error: 'id de vídeo inválido' });
  }

  const isStreamRequest = req.query?.stream === '1' || req.query?.stream === 'true' || Boolean(req.headers?.range);

  // 1. Verifica cache rápido em memória
  const cached = audioCache.get(id);
  if (cached && (Date.now() - cached.time) < 1800000) {
    if (isStreamRequest) {
      const ok = await pipeAudioStream(req, res, cached.url);
      if (ok) return;
      // Se a URL expirou, descarta cache e continua para obter nova
      audioCache.delete(id);
    } else if (req.query?.redirect === '1') {
      res.setHeader('Location', cached.url);
      return res.status(302).end();
    } else {
      return res.status(200).json(cached.payload);
    }
  }

  // 2. Extrai fluxo de áudio via ytdl primário
  try {
    let result = null;
    try {
      const info = await getAudioInfo(`https://www.youtube.com/watch?v=${id}`);
      const format = AUDIO_WITHOUT_VIDEO(info?.formats || []);
      if (format && format.url) {
        result = {
          url: format.url,
          mimeType: format.mimeType || 'audio/mp4',
          bitrate: Number(format.bitrate || 0),
          duration: Number(info.videoDetails?.lengthSeconds || 0),
        };
      }
    } catch (primaryErr) {
      console.warn(`[alive api/audio] ytdl primário falhou para ${id}:`, primaryErr?.message || primaryErr);
    }

    // 3. Fallback em instâncias públicas se o ytdl falhou
    if (!result) {
      result = await fetchFallbackAudio(id);
    }

    if (!result || !result.url) {
      return res.status(404).json({ error: 'nenhum fluxo de áudio encontrado' });
    }

    const host = req.headers?.host || 'localhost:3000';
    const proto = req.headers?.['x-forwarded-proto'] || 'https';
    const origin = `${proto}://${host}`;

    const payload = {
      ok: true,
      id,
      url: `${origin}/api/audio?id=${id}&stream=1`,
      streamUrl: `${origin}/api/audio?id=${id}&stream=1`,
      directUrl: result.url,
      mimeType: result.mimeType || 'audio/mp4',
      bitrate: result.bitrate || 0,
      duration: result.duration || 0,
    };

    audioCache.set(id, { url: result.url, time: Date.now(), payload });
    if (audioCache.size > 150) {
      const first = audioCache.keys().next().value;
      audioCache.delete(first);
    }

    if (isStreamRequest) {
      const ok = await pipeAudioStream(req, res, result.url);
      if (ok) return;
    }

    if (req.query?.redirect === '1') {
      res.setHeader('Location', result.url);
      return res.status(302).end();
    }

    return res.status(200).json(payload);
  } catch (err) {
    console.error('[alive api/audio] erro geral:', err?.message || err);
    return res.status(500).json({ error: err?.message || 'erro ao extrair áudio' });
  }
}
