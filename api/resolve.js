// GET /api/resolve?url=<texto>&max=20
// -> {type:'video'|'playlist'|'search', item?, items:[]}
import { extractVideoId, extractListId, videoMeta, playlistVideos, searchVideos } from './_lib/youtube.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');

  const raw = String(req.query?.url || '').trim();
  if (!raw) return res.status(400).json({ type: 'search', items: [] });

  const max = Math.min(100, Math.max(1, Number(req.query?.max) || 20));
  const videoId = extractVideoId(raw);
  const listId = extractListId(raw);

  try {
    // Link de vídeo (mesmo que tenha playlist junto) vira 1 música.
    if (videoId) {
      const item = await videoMeta(videoId);
      return res.status(200).json({ type: 'video', item, items: [item] });
    }

    // Playlist -> várias músicas.
    if (listId) {
      const items = await playlistVideos(listId, max);
      if (items.length) return res.status(200).json({ type: 'playlist', items });
    }

    // Qualquer outra coisa -> busca no YouTube.
    const items = await searchVideos(raw, 12);
    return res.status(200).json({ type: 'search', items });
  } catch (e) {
    console.error('[alive] resolve:', e.message);
    return res.status(502).json({ type: 'search', items: [], error: 'Falha ao ler no YouTube' });
  }
}
