// POST /api/ai — Gateway da IA para o bot de chat
import { loadState } from './_lib/store.js';
import { buildAiSystemPrompt, normalizeLang } from '../js/i18n.js';

export function buildSystemPrompt(customPersonality = '', lang = 'pt') {
  return buildAiSystemPrompt(customPersonality, lang);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, channel, systemPrompt, lang: reqLang, model: reqModel, apiKey: reqApiKey, baseUrl: reqBaseUrl, history } = req.body || {};
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Prompt é obrigatório.' });
  }

  let aiCfg = {};
  let cfgLang = 'pt';
  if (!reqApiKey || !reqBaseUrl || !reqModel || !reqLang) {
    try {
      const s = await loadState(channel || '');
      aiCfg = s.config?.ai || {};
      cfgLang = s.config?.language || 'pt';
    } catch { /* fallback */ }
  }
  const lang = normalizeLang(reqLang || cfgLang);
  const baseUrl = (reqBaseUrl || aiCfg.baseUrl || process.env.AI_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/+$/, '');
  const apiKey = (reqApiKey || aiCfg.apiKey || process.env.GROQ_API_KEY || '').trim();
  const model = reqModel || aiCfg.model || 'qwen/qwen3.8-27b';
  const sys = systemPrompt && typeof systemPrompt === 'string' && systemPrompt.includes('Alive (@alivebot1)')
    ? systemPrompt
    : buildSystemPrompt(systemPrompt || aiCfg.systemPrompt || '', lang);

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);

    const safeHistory = Array.isArray(history)
      ? history.filter((h) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string').slice(-8)
      : [];

    const r = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: sys },
          ...safeHistory,
          { role: 'user', content: prompt.slice(0, 500) }
        ],
        max_tokens: 800,
        temperature: 0.8
      }),
      signal: ctrl.signal
    }).finally(() => clearTimeout(t));

    const data = await r.json().catch(() => null);
    if (!r.ok) {
      const err = data?.error?.message || `Erro da API da IA (${r.status})`;
      return res.status(r.status).json({ error: err, status: r.status });
    }

    let clean = (data?.choices?.[0]?.message?.content || '').replace(/[\r\n]+/g, ' ').trim();
    if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith('“') && clean.endsWith('”'))) {
      clean = clean.slice(1, -1).trim();
    }
    clean = clean.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, '').replace(/\s+/g, ' ').trim();
    // Remove alucinações de que música/áudio está desativado ou que não consegue pedir no app (pt/en/es)
    clean = clean.replace(/\b(essa|a|esta|la)?\s*(função|reprodução|capacidade|función|reproducción)?\s*(de\s+(música|áudio|playlist|tocar))?\s*(está|tá)\s*(desativada|desligada|indisponível|desactivada|no\s+disponible)\b[^\.!]*[\.!]/gi, '').trim();
    clean = clean.replace(/\b(this|the)?\s*(music|audio|playback|song\s+request)?\s*(feature|function)?\s*(is|are)\s*(disabled|off|unavailable)\b[^\.!]*[\.!]/gi, '').trim();
    clean = clean.replace(/\b(não|nao|no)\s+(consigo|posso|puedo|tenho\s+como|tenho\s+acesso|tengo\s+acceso|sei)\s+([^\.!]*)(no\s+app|no\s+aplicativo|en\s+la\s+app|pedir\s+música|tocar\s+música|pedir\s+música)[^\.!]*[\.!]/gi, '').trim();
    clean = clean.replace(/\bI\s+(can't|cannot|am\s+unable\s+to)\s+([^\.!]*)(request\s+music|play\s+music|access\s+the\s+app)[^\.!]*[\.!]/gi, '').trim();
    clean = clean.replace(/\b(peça|use|usa)\s+(você\s+mesmo|tú\s+mismo|o\s+comando|el\s+comando)\s+!play[^\.!]*[\.!]/gi, '').trim();

    return res.status(200).json({ text: clean, model });
  } catch (err) {
    const isTimeout = err.name === 'AbortError';
    return res.status(504).json({ error: isTimeout ? 'A IA demorou demais para responder.' : err.message });
  }
}
