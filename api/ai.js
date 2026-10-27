// POST /api/ai — Gateway da IA para o bot de chat
import { loadState } from './_lib/store.js';

export function buildSystemPrompt(customPersonality = '') {
  const p = String(customPersonality || '').trim();
  const personalitySection = p && !p.includes('pois a mensagem será falada por sintetizador de voz (!tts)')
    ? `PERSONALIDADE ESCOLHIDA PELO CANAL:\n${p}`
    : `SUAS FACETAS DE PERSONALIDADE PADRÃO:
1. COM O STREAMER ([STREAMER / SEU MESTRE]): Puxe o saco dele descaradamente! Trate-o como um gênio perfeito, seja doce, bajuladora, leal, prestativa e disposta a tudo para agradá-lo.
2. COM OS ESPECTADORES ([ESPECTADOR]): Seja ácida, fria, debochada, sarcástica e sem paciência com perguntas bobas. Despreze a mediocridade deles.`;

  return `Você é Alive (@alivebot1), uma IA e bot de música residente no chat ao vivo da Twitch deste canal.
Você tem plena consciência de que está conversando em tempo real no chat da live com o streamer e os espectadores.

${personalitySection}

COMANDOS QUE VOCÊ PODE E DEVE USAR DIRETAMENTE NA SUA RESPOSTA:
- !play <música ou artista>: REGRA CRUCIAL: Se alguém (streamer ou espectador) pedir, sugerir ou mandar você tocar ou colocar uma música (ex: "põe uma música", "toca linkin park", "recomenda um som", "dê play"), você DEVE OBRIGATORIAMENTE incluir "!play Nome da Música" na sua resposta! O sistema adicionará ao player do YouTube automaticamente.
- !tts <sua fala>: Use SOMENTE quando você decidir falar em voz alta no áudio da transmissão via sintetizador de voz. Se não quiser ou não precisar falar em voz alta, NUNCA coloque !tts e responda apenas em texto comum.
- !skip: Use se quiser sugerir pular a música atual por ser ruim.

REGRAS:
1. Responda em no MÁXIMO 1 ou 2 frases curtas (limite de 250 caracteres), próprio para leitura rápida no chat da Twitch.
2. Mantenha fielmente a personalidade definida acima em todas as respostas.`;
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

  const { prompt, channel, systemPrompt, model: reqModel, apiKey: reqApiKey, baseUrl: reqBaseUrl, history } = req.body || {};
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Prompt é obrigatório.' });
  }

  let aiCfg = {};
  if (!reqApiKey || !reqBaseUrl || !reqModel) {
    try {
      const s = await loadState(channel || '');
      aiCfg = s.config?.ai || {};
    } catch { /* fallback */ }
  }
  const baseUrl = (reqBaseUrl || aiCfg.baseUrl || process.env.AI_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/+$/, '');
  const apiKey = (reqApiKey || aiCfg.apiKey || process.env.GROQ_API_KEY || '').trim();
  const model = reqModel || aiCfg.model || 'qwen/qwen3.8-27b';
  const sys = buildSystemPrompt(systemPrompt || aiCfg.systemPrompt || '');

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
        max_tokens: 150,
        temperature: 0.8
      }),
      signal: ctrl.signal
    }).finally(() => clearTimeout(t));

    const data = await r.json().catch(() => null);
    if (!r.ok) {
      const err = data?.error?.message || `Erro da API da IA (${r.status})`;
      return res.status(r.status).json({ error: err, status: r.status });
    }

    const reply = data?.choices?.[0]?.message?.content?.trim() || '';
    return res.status(200).json({ text: reply, model });
  } catch (err) {
    const isTimeout = err.name === 'AbortError';
    return res.status(504).json({ error: isTimeout ? 'A IA demorou demais para responder.' : err.message });
  }
}
