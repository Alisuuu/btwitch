import ytdl from '@distube/ytdl-core';

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

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');

  const id = String(req.query?.id || req.query?.v || '').trim();
  if (!id || !/^[a-zA-Z0-9_-]{10,13}$/.test(id)) {
    return res.status(400).json({ error: 'id de vídeo inválido' });
  }

  try {
    const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${id}`);
    const format = AUDIO_WITHOUT_VIDEO(info?.formats || []);

    if (!format || !format.url) {
      return res.status(404).json({ error: 'nenhum fluxo de áudio encontrado' });
    }

    if (req.query?.redirect === '1' || req.headers.accept?.includes('audio/')) {
      return res.redirect(302, format.url);
    }

    return res.status(200).json({
      ok: true,
      id,
      url: format.url,
      mimeType: format.mimeType || 'audio/webm',
      bitrate: Number(format.bitrate || 0),
      duration: Number(info.videoDetails?.lengthSeconds || 0),
    });
  } catch (err) {
    console.error('[alive api/audio] erro:', err?.message || err);
    return res.status(500).json({ error: err?.message || 'erro ao extrair áudio' });
  }
}
