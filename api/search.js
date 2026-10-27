// GET /api/search?q=<termo>&limit=12  -> {items:[{id,title,channel,thumb,duration}]}
import { searchVideos } from './_lib/youtube.js';

const cache = new Map(); // q -> {t, items}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

  const q = String(req.query?.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Informe q', items: [] });

  const limit = Math.min(25, Math.max(1, Number(req.query?.limit) || 12));
  const key = q.toLowerCase() + '|' + limit;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < 5 * 60 * 1000) {
    return res.status(200).json({ items: hit.items, cached: true });
  }

  try {
    const items = await searchVideos(q, limit);
    if (cache.size > 60) cache.delete(cache.keys().next().value);
    cache.set(key, { t: Date.now(), items });
    if (!items.length) return res.status(200).json({ items: [], empty: true });
    return res.status(200).json({ items });
  } catch (e) {
    console.error('[alive] busca:', e.message);
    return res.status(502).json({ error: 'Falha na busca no YouTube', items: [] });
  }
}
