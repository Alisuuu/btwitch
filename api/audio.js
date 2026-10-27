// Endpoint para extração de stream nativo de áudio (elimina erros de embed e iframe do YouTube)
if (!Array.prototype.toSorted) {
  Array.prototype.toSorted = function(compareFn) { return this.slice().sort(compareFn); };
}

let ytdlModule = null;

async function getYtdl() {
  if (!ytdlModule) {
    ytdlModule = await import('@distube/ytdl-core');
  }
  return ytdlModule;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');

  const id = String(req.query?.id || req.query?.v || '').trim();
  if (!id || !/^[a-zA-Z0-9_-]{10,13}$/.test(id)) {
    return res.status(400).json({ error: 'id de vídeo inválido' });
  }

  try {
    const ytdl = await getYtdl();
    const yt = new ytdl.Ytdl();
    const info = await yt.getInfo(`https://www.youtube.com/watch?v=${id}`);
    const format = ytdl.chooseFormat(info.formats, { filter: { hasAudio: true, hasVideo: false } });

    if (!format || !format.url) {
      return res.status(404).json({ error: 'nenhum fluxo de áudio encontrado' });
    }

    // Se o cliente pediu redirecionamento ou tag de áudio
    if (req.query?.redirect === '1' || req.headers.accept?.includes('audio/')) {
      return res.redirect(302, format.url);
    }

    return res.status(200).json({
      ok: true,
      id,
      url: format.url,
      mimeType: format.mimeType,
      bitrate: format.bitrate,
      duration: Number(info.videoDetails?.lengthSeconds || 0),
    });
  } catch (err) {
    console.error('[alive api/audio] erro:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
