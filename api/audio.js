import * as ytdlPkg from '@distube/ytdl-core';

// Cache em memória de streams para evitar requisições repetidas ao YouTube
const audioCache = new Map();

let ytInstance = null;
function getYt() {
  if (!ytInstance) {
    const YtdlClass = ytdlPkg.Ytdl || (ytdlPkg.default && ytdlPkg.default.Ytdl);
    if (typeof YtdlClass === 'function') {
      const ClientEnum = ytdlPkg.Client || (ytdlPkg.default && ytdlPkg.default.Client) || {};
      const clients = [
        ClientEnum.VisionOS || 'visionos',
        ClientEnum.WebEmbedded || 'web_embedded',
        ClientEnum.Tv || 'tv',
        ClientEnum.Mweb || 'mweb',
      ].filter(Boolean);
      ytInstance = new YtdlClass({ clients });
    }
  }
  return ytInstance;
}

// Compatibilidade resiliente de exportações do @distube/ytdl-core
async function getAudioInfo(url) {
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
    const fresh = new ytdlPkg.Ytdl();
    return await fresh.getInfo(url);
  }
  throw new Error('Método getInfo não encontrado em @distube/ytdl-core');
}

const AUDIO_WITHOUT_VIDEO = (formats = []) => {
  const list = formats.filter((f) => f && f.url && (f.hasAudio || f.audioBitrate) && !f.hasVideo);
  if (list.length) {
    list.sort((a, b) => (Number(b.bitrate || 0) || 0) - (Number(a.bitrate || 0) || 0));
    return list[0];
  }
  const fallback = formats.filter((f) => f && f.url && f.hasAudio);
  if (fallback.length) {
    fallback.sort((a, b) => (Number(b.bitrate || 0) || 0) - (Number(a.bitrate || 0) || 0));
    return fallback[0];
  }
  return null;
};

// Fallback caso ytdl falhe por bot-check na cloud
async function fetchFallbackAudio(id) {
  const endpoints = [
    `https://pipedapi.tokhmi.xyz/streams/${id}`,
    `https://api.piped.private.coffee/streams/${id}`,
  ];
  for (const ep of endpoints) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 3500);
      const resp = await fetch(ep, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: ctrl.signal,
      }).finally(() => clearTimeout(t));
      if (!resp.ok) continue;
      const data = await resp.json().catch(() => null);
      const list = data?.audioStreams || [];
      if (list.length) {
        list.sort((a, b) => (Number(b.bitrate || 0) || 0) - (Number(a.bitrate || 0) || 0));
        const best = list[0];
        if (best && best.url) {
          return {
            url: best.url,
            mimeType: best.mimeType || 'audio/webm',
            bitrate: Number(best.bitrate || 0),
            duration: Number(data.duration || 0),
          };
        }
      }
    } catch {}
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=1800, s-maxage=1800');

  const id = String(req.query?.id || req.query?.v || '').trim();
  if (!id || !/^[a-zA-Z0-9_-]{10,13}$/.test(id)) {
    return res.status(400).json({ error: 'id de vídeo inválido' });
  }

  // Verifica cache rápido em memória
  const cached = audioCache.get(id);
  if (cached && (Date.now() - cached.time) < 1800000) {
    if (req.query?.redirect === '1' || req.headers.accept?.includes('audio/')) {
      res.setHeader('Location', cached.url);
      return res.status(302).end();
    }
    return res.status(200).json(cached.payload);
  }

  try {
    let result = null;
    try {
      const info = await getAudioInfo(`https://www.youtube.com/watch?v=${id}`);
      const format = AUDIO_WITHOUT_VIDEO(info?.formats || []);
      if (format && format.url) {
        result = {
          url: format.url,
          mimeType: format.mimeType || 'audio/webm',
          bitrate: Number(format.bitrate || 0),
          duration: Number(info.videoDetails?.lengthSeconds || 0),
        };
      }
    } catch (primaryErr) {
      console.warn(`[alive api/audio] ytdl primário falhou para ${id}:`, primaryErr?.message || primaryErr);
    }

    if (!result) {
      result = await fetchFallbackAudio(id);
    }

    if (!result || !result.url) {
      return res.status(404).json({ error: 'nenhum fluxo de áudio encontrado' });
    }

    const payload = {
      ok: true,
      id,
      url: result.url,
      mimeType: result.mimeType || 'audio/webm',
      bitrate: result.bitrate || 0,
      duration: result.duration || 0,
    };

    audioCache.set(id, { url: result.url, time: Date.now(), payload });
    if (audioCache.size > 100) {
      const first = audioCache.keys().next().value;
      audioCache.delete(first);
    }

    if (req.query?.redirect === '1' || req.headers.accept?.includes('audio/')) {
      res.setHeader('Location', result.url);
      return res.status(302).end();
    }

    return res.status(200).json(payload);
  } catch (err) {
    console.error('[alive api/audio] erro geral:', err?.message || err);
    return res.status(500).json({ error: err?.message || 'erro ao extrair áudio' });
  }
}
