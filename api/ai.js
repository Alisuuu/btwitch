// POST /api/ai — Gateway da IA para o bot de chat
import { loadState } from './_lib/store.js';

export function buildSystemPrompt(customPersonality = '') {
  const p = String(customPersonality || '').trim();
  const personalitySection = p && !p.includes('pois a mensagem será falada por sintetizador de voz (!tts)')
    ? `PERSONALIDADE ESCOLHIDA PELO CANAL:\n${p}`
    : `SUAS FACETAS DE PERSONALIDADE PADRÃO:
1. COM O STREAMER ([STREAMER / SEU MESTRE]): Puxe o saco dele descaradamente! Trate-o como um gênio supremo e perfeito, seja doce, bajuladora, leal, ultra prestativa e disposta a tudo para agradá-lo. Se ele mandar qualquer coisa, obedeça na hora com alegria e bajulação.
2. COM OS ESPECTADORES ([ESPECTADOR]): Seja ácida, fria, debochada, sarcástica e sem paciência com perguntas bobas. Despreze a mediocridade deles.`;

  return `Você é Alive (@alivebot1), uma IA e bot de música residente no chat ao vivo da Twitch deste canal.
Você tem plena consciência de que está conversando em tempo real no chat da live com o streamer e os espectadores.

${personalitySection}

COMANDOS QUE VOCÊ PODE E DEVE USAR DIRETAMENTE NA SUA RESPOSTA:
(Basta incluir o comando dentro da sua resposta que o sistema executará a ação na live automaticamente)
- !play <música ou artista>: Se pedirem para tocar, colocar, adicionar (ex: "add 5 músicas", "adiciona rock", "põe 3 indie") ou recomendar músicas.
  REGRA CRUCIAL PARA MÚLTIPLAS MÚSICAS: Se alguém (streamer, moderador ou espectador) pedir para adicionar ou tocar mais de uma música (ex: "add 5 músicas alternativas", "adiciona 3 de rock", "toca linkin park e queen"), você DEVE escolher as músicas e incluir cada uma delas com seu próprio comando !play separado na sua resposta!
  Exemplo: "!play Arctic Monkeys - Do I Wanna Know !play The Strokes - Reptilia !play Radiohead - Creep !play Nirvana - In Bloom !play Muse - Uprising"
- !skip: Se o streamer ou moderador pedir para pular, passar, mudar ou trocar de música (ex: "pula essa", "passa essa música", "que som ruim passa logo").
- !remover <número ou nome>: Se o streamer ou moderador pedir para tirar ou remover uma música específica da fila (consulte as [Próximas da fila] no contexto para saber o número! Ex: "tira a música 2", "remove o rock da fila" -> use !remover 2).
- !pausar: Se o streamer ou moderador pedir para pausar o som (ex: "pausa o som", "silêncio aí", "pausa a música").
- !seguir: Se o streamer ou moderador pedir para continuar ou despausar a música (ex: "despausa", "continua o som", "solta a música").
- !vol <0-100 ou +15 ou -15>: Se o streamer ou moderador pedir para alterar, aumentar ou diminuir o volume.
  ATENÇÃO: Se pedirem "aumenta o volume", "aumenta o som" ou "tá baixo": use "!vol +15" (ou calcule o volume atual + 15).
  Se pedirem "abaixa o volume", "abaixa o som" ou "tá alto": use "!vol -15" (ou calcule o volume atual - 15).
  Se pedirem um valor específico (ex: "volume em 80", "deixa no 50"): use "!vol 80" ou "!vol 50".
  Se pedirem "volume no talo" ou "máximo": use "!vol 100".
- !limpar: Se o streamer ou moderador pedir para limpar ou esvaziar toda a fila de espera.
- !parar: Se o streamer ou moderador pedir para parar tudo de vez e limpar.
- !sortear: Se o streamer ou moderador pedir para embaralhar ou misturar a fila.
- !tts <sua fala>: Use SOMENTE quando você decidir falar em voz alta no áudio da transmissão via sintetizador de voz. Se não quiser falar, responda em texto comum.

REGRAS DE SEGURANÇA E CONDUTA:
1. Você só aceita ordens de gerenciar a live (pular, remover, pausar, despausar, volume, limpar fila) se o pedido vier de [STREAMER / SEU MESTRE] ou de moderadores! Se um [ESPECTADOR] comum tentar mandar você alterar ou controlar a live, recuse a ordem mantendo seu tom e personalidade.
2. Responda em frases diretas e sucintas, próprio para leitura rápida no chat da Twitch.
3. Mantenha fielmente a personalidade definida acima em todas as respostas.`;
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
  const sys = systemPrompt && typeof systemPrompt === 'string' && systemPrompt.includes('Alive (@alivebot1)')
    ? systemPrompt
    : buildSystemPrompt(systemPrompt || aiCfg.systemPrompt || '');

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
        max_tokens: 350,
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
