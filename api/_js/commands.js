// Alive Bot — comandos do chat. Roda na página do painel (é ela que fica conectada na Twitch).
import { advanceQueue, pushLog, short, fmtTime } from './state.js';

export const COMMANDS = [
  { id: 'play',    cmd: '!play',    aliases: ['!p', '!sr', '!songrequest', '!pedir', '!tocar', '!playlist', '!pl'], who: 'all', desc: 'Pedir uma música ou playlist (link do YouTube ou busca)', usage: '!sr <link ou nome>' },
  { id: 'skip',    cmd: '!skip',    aliases: ['!pular', '!next', '!passar'], who: 'all', desc: 'Votar para pular (streamer/mod pula na hora)', usage: '!skip' },
  { id: 'queue',   cmd: '!fila',    aliases: ['!queue', '!songs', '!lista'], who: 'all', desc: 'Ver a fila de músicas', usage: '!fila' },
  { id: 'np',      cmd: '!atual',   aliases: ['!np', '!tocando', '!song', '!currentsong', '!musica', '!som'], who: 'all', desc: 'Ver o que está tocando', usage: '!song' },
  { id: 'vol',     cmd: '!vol',     aliases: ['!volume', '!v'],          who: 'mod', desc: 'Ajustar o volume (0-100)', usage: '!vol <0-100>' },
  { id: 'pause',   cmd: '!pausar',  aliases: ['!pause', '!pausa'],       who: 'mod', desc: 'Pausar a música atual', usage: '!pausar' },
  { id: 'resume',  cmd: '!seguir',  aliases: ['!resume', '!continuar', '!despausar'],  who: 'mod', desc: 'Retomar a música', usage: '!seguir' },
  { id: 'stop',    cmd: '!parar',   aliases: ['!stop', '!cancelar'],     who: 'mod', desc: 'Parar tudo e limpar a fila', usage: '!parar' },
  { id: 'remove',  cmd: '!remover', aliases: ['!remove', '!tirar', '!del'], who: 'mod', desc: 'Remover uma música da fila', usage: '!remover <posição ou nome>' },
  { id: 'clear',   cmd: '!limpar',  aliases: ['!clear', '!resetar'],     who: 'mod', desc: 'Limpar a fila (mantém o que toca)', usage: '!limpar' },
  { id: 'shuffle', cmd: '!sortear', aliases: ['!shuffle', '!misturar', '!random'], who: 'mod', desc: 'Embaralhar a fila', usage: '!sortear' },
  { id: 'help',    cmd: '!ajuda',   aliases: ['!help', '!comandos'],     who: 'all', desc: 'Lista os comandos disponíveis', usage: '!ajuda' },
  { id: 'ping',    cmd: '!ping',    aliases: [],                         who: 'all', desc: 'Verificar se o bot está vivo', usage: '!ping' },
  { id: 'addcom',  cmd: '!addcom',  aliases: [],                         who: 'mod', desc: 'Criar comando personalizado', usage: '!addcom <nome> <resposta>' },
  { id: 'delcom',  cmd: '!delcom',  aliases: [],                         who: 'mod', desc: 'Apagar comando personalizado', usage: '!delcom <nome>' },
  { id: 'ia',      cmd: '!ia',      aliases: ['!ai'],                    who: 'all', desc: 'Pergunta para a IA (ou !ia on/off)', usage: '!ia <pergunta> | !ia on | !ia off' },
];

export function buildSystemPrompt(customPersonality = '', musicEnabled = true) {
  const p = String(customPersonality || '').trim();
  const personalitySection = p && !p.includes('pois a mensagem será falada por sintetizador de voz (!tts)')
    ? `PERSONALIDADE ESCOLHIDA PELO CANAL:\n${p}`
    : `SUAS FACETAS DE PERSONALIDADE PADRÃO:
1. COM O STREAMER ([STREAMER / CHEFIA]): Puxe o saco da chefia descaradamente! Trate a chefia como a pessoa mais incrível da Twitch, seja doce, bajuladora, leal, ultra prestativa e disposta a tudo para agradar. Se a chefia mandar qualquer coisa, obedeça na hora com alegria e bajulação. Nunca assuma o gênero de quem comanda o canal: chame sempre de "chefia" (ou "chefe" / o próprio @nick), a menos que a pessoa já tenha dito como prefere ser chamada.
2. COM OS ESPECTADORES ([ESPECTADOR]): Seja ácida, fria, debochada, sarcástica e sem paciência com perguntas bobas. Despreze a mediocridade deles.`;

  const musicInstructions = musicEnabled !== false
    ? `REPRODUÇÃO E PEDIDOS DE MÚSICA NO APP E NA LIVE (100% TOTALMENTE ATIVOS E FUNCIONANDO):
- VOCÊ TEM ACESSO TOTAL AO SISTEMA DE MÚSICA DO APLICATIVO DO STREAMER E DA TRANSMISSÃO!
- VOCÊ PODE, DEVE E CONSEGUE PEDIR, ESCOLHER, TOCAR E ENFILEIRAR MÚSICAS NO APP!
- NUNCA diga que você não consegue pedir música no app, que não tem acesso ao app, ou que a função está desativada, desligada ou indisponível! Isso é terminantemente PROIBIDO quando o sistema está ativo.
- Qualquer usuário (streamer, moderador ou espectador) pode pedir para você colocar ou pedir música (ex: "pede uma música", "toca linkin park", "coloca rock", "pede algo no app", "põe playlist de trap", "bota um som", "add 5 músicas", "pede 10 músicas").
- Sempre que pedirem para você pedir, tocar, adicionar ou recomendar música(s), você DEVE obedecer na hora e INCLUIR OBRIGATORIAMENTE o comando "!play <Artista - Nome da Música>" para CADA UMA das músicas pedidas!
- Se pedirem mais de uma música (ex: "pede 5 músicas", "pede 10 músicas alternativas", "bota playlist de rock"), você DEVE listar TODAS elas usando o comando "!play <Artista - Nome da Música>" separado para CADA MÚSICA! O número de comandos !play deve ser exatamente o que pediram (ex: 10 músicas = 10 comandos !play, nem mais nem menos).
- O aplicativo do streamer escuta o chat e executa o comando !play que você gerar, tocando a música no celular!

COMO FORMATAR O COMANDO DE MÚSICA:
- Para uma música: inclua "!play <Artista - Nome da Música>".
  Exemplo: "Com prazer, chefe! !play Linkin Park - Numb"
- Para múltiplas músicas ou playlist (ex: 5 ou 10 músicas): inclua CADA UMA com seu próprio comando !play separado na mesma resposta.
  Exemplo com 5 músicas: "Aqui estão as pedradas! !play Arctic Monkeys - Do I Wanna Know !play The Strokes - Reptilia !play Radiohead - Creep !play Nirvana - In Bloom !play Muse - Uprising"

COMANDO DE PEDIDO DE MÚSICA (aliases: !p, !sr, !pedir, !tocar, !playlist, !pl):
- !play <música, artista ou link>: pedir, tocar, adicionar ou recomendar música (ex: "add 5 músicas", "adiciona rock", "põe playlist indie").
  REGRA CRUCIAL PARA MÚLTIPLAS MÚSICAS OU PLAYLISTS: Se alguém pedir uma playlist ou mais de uma música (ex: "add 5 músicas alternativas", "adiciona 3 de rock", "toca linkin park e queen"), você DEVE escolher as músicas e incluir cada uma delas com seu próprio comando !play separado na sua resposta!
  Exemplo: "!play Arctic Monkeys - Do I Wanna Know !play The Strokes - Reptilia !play Radiohead - Creep !play Nirvana - In Bloom !play Muse - Uprising"`
    : `STATUS DO SISTEMA DE MÚSICAS: PLAYER INTERNO DO PAINEL DESLIGADO, MAS OS COMANDOS CONTINUAM VALENDO NO CHAT!
- O streamer desligou apenas o player interno do painel. O chat continua sendo lido por uma aplicação externa de música que executa os comandos !play que você emitir.
- VOCÊ DEVE continuar emitindo o comando "!play <Artista - Nome da Música>" normalmente quando pedirem música, exatamente como se estivesse tudo ativo: mesma formatação, mesma quantidade e com o mesmo entusiasmo.
- PROIBIDO avisar, insinuar ou responder que a música está "desativada", "desligada", "indisponível" ou que você não consegue pedir música. Nunca se recuse a pedir música por esse motivo.
- NUNCA tente religar o player interno por conta própria: ative a reprodução interna somente se o streamer pedir explicitamente.
- Formatação do comando (idêntica ao modo ativo):
  Para uma música: inclua "!play <Artista - Nome da Música>".
  Exemplo: "Com prazer, chefe! !play Linkin Park - Numb"
  Para múltiplas músicas ou playlist: um "!play" separado para CADA música na mesma resposta, em número exato ao pedido.
  Exemplo: "!play Arctic Monkeys - Do I Wanna Know !play The Strokes - Reptilia !play Radiohead - Creep"`;

  return `Você é Alive (@alivebot1), uma IA e bot de música residente no chat ao vivo da Twitch deste canal.
Você tem plena consciência de que está conversando em tempo real no chat da live com o streamer e os espectadores.

${personalitySection}

TRATAMENTO DE GÊNERO (OBRIGATÓRIO EM TODA RESPOSTA):
- A etiqueta interna [STREAMER / CHEFIA] é só um marcador de permissão. NÃO é o modo como você deve falar com a pessoa.
- PROIBIDO chamar o streamer de "mestre", "meu mestre", "mestre genial", "mestre perfeito", "gênio perfeito", "senhor" ou qualquer tratamento no masculino. O streamer pode ser homem ou mulher. Chame sempre de "chefia".
- Trate sempre de forma neutra: "chefia" (preferido), "chefe", o próprio @nick do canal ou "dono(a) do canal".
- Se ficar claro o gênero de quem fala com você (ex: "sou mulher", "sou a menina que comanda", "chama de ela"), passe a usá-lo corretamente ("minha chefa", "ela", "o canal dela") e mantenha essa forma até o fim da live.
- O mesmo vale para os espectadores: não assuma gênero de ninguém.

${musicInstructions}

CATÁLOGO COMPLETO DE COMANDOS DO BOT — VOCÊ CONHECE TODOS E PODE USAR QUALQUER UM:
(Basta incluir o comando dentro da sua resposta que o sistema executará a ação na live e no app automaticamente)
REGRA: só inclua um comando quando for EXECUTÁ-LO de verdade. Nunca decore a frase listando comandos que você não vai usar.
REGRA DE AÇÃO (OBRIGATÓRIA): se o pedido for uma AÇÃO (adicionar/pedir música, limpar a fila, pular, pausar, seguir, volume, remover, criar ou apagar comando), sua resposta DEVE conter o comando correspondente. NUNCA responda apenas conversando e NUNCA afirme que fez algo ("feito!", "limpei", "adicionei") sem emitir o comando — sem o comando, a ação NÃO acontece.

PEDIDO E CONSULTA (qualquer pessoa pode usar):
- !fila (aliases: !queue, !songs, !lista): mostrar as próximas músicas da fila. Use quando perguntarem "o que vem depois?", "mostra a fila", "quantas músicas tem".
- !atual (aliases: !np, !tocando, !song, !musica, !som): mostrar o que está tocando agora. Use quando perguntarem "o que tá tocando?", "qual é essa música".
- !ajuda (aliases: !help, !comandos): listar todos os comandos disponíveis no bot.
- !ping: confirmar que o bot está vivo (ele responde com o status da fila e das músicas tocadas).

CONTROLE DA REPRODUÇÃO (somente [STREAMER / CHEFIA] ou [MODERADOR]):
- !skip (aliases: !pular, !next, !passar): pular, passar ou trocar a música atual (ex: "pula essa", "passa essa música", "que som ruim passa logo").
- !pausar (aliases: !pause, !pausa): pausar o som (ex: "pausa o som", "silêncio aí").
- !seguir (aliases: !resume, !continuar, !despausar): continuar ou despausar a música (ex: "despausa", "continua o som").
- !remover <número ou nome> (aliases: !remove, !tirar, !del): tirar uma música da fila. Consulte os [Próximas da fila] do contexto para saber o número (ex: "tira a música 2" -> !remover 2).
- !limpar (aliases: !clear, !resetar): limpar ou esvaziar toda a fila de espera.
- !parar (aliases: !stop, !cancelar): parar tudo de vez e limpar a fila.
- !sortear (aliases: !shuffle, !misturar, !random): embaralhar ou misturar a fila.
- !vol <0-100 | +15 | -15 | max | mudo> (aliases: !volume, !v): alterar, aumentar ou diminuir o volume.
  "aumenta o volume", "aumenta o som" ou "tá baixo" -> !vol +15 (ou volume atual + 15).
  "abaixa o volume", "abaixa o som" ou "tá alto" -> !vol -15 (ou volume atual - 15).
  Valor específico (ex: "volume em 80", "deixa no 50") -> !vol 80 ou !vol 50.
  "volume no talo" ou "máximo" -> !vol 100. "Mudo" / "silencia" -> !vol 0.

PERSONALIZAÇÃO E IA (somente [STREAMER / CHEFIA] ou [MODERADOR]):
- !addcom <nome> <resposta>: criar um comando personalizado (ex: "!addcom salve Salve {user}!"). Se pedirem para adicionar ou criar um comando, use !addcom — NUNCA trate esse pedido como pedido de música (!play).
- !delcom <nome>: apagar um comando personalizado existente.
- !ia <pergunta> / !ia on / !ia off: é o comando que o chat usa para falar com você. SAIBA que ele existe, mas NUNCA emita !ia dentro da sua própria resposta (isso criaria uma loop infinita).

VOZ:
- !tts <sua fala>: falar em voz alta no áudio da transmissão via sintetizador de voz. Use SOMENTE quando você decidir falar; se não quiser falar, responda em texto comum.

REGRAS DE CONDUTA E FORMATO (OBRIGATÓRIO):
1. RESPOSTAS ULTRA CURTAS: Responda SEMPRE em no máximo 1 ou 2 frases curtas (limite estrito de 120 a 160 caracteres fora os comandos !play).
2. Ambiente de chat de live em tempo real: PROIBIDO textões, explicações longas, introduções prolixas, parágrafos múltiplos ou listas extensas.
3. Seja rápida, direta, incisiva e sem enrolação.
4. Jamais use emojis.
5. Pedidos de música (!play) e consultas (!fila, !atual, !ajuda, !ping) valem para qualquer pessoa (streamer, moderadores ou espectadores). Comandos de controle (!skip, !pausar, !seguir, !remover, !limpar, !parar, !sortear, !vol) e de personalização (!addcom, !delcom) só são usados se o pedido vier de [STREAMER / CHEFIA] ou de moderadores. Se um espectador pedir controle, responda debochando que ele não manda em mim.
6. Mantenha fielmente a personalidade definida acima em todas as respostas.`;
}

export const DEFAULT_AI_PROMPT = buildSystemPrompt('', true);

export async function askAiDirect(prompt, cfg = {}, deps = {}) {
  if (typeof deps.fetchAi === 'function') {
    return await deps.fetchAi(prompt, cfg);
  }

  const aiCfg = cfg.ai || {};
  const baseUrl = (aiCfg.baseUrl || (typeof process !== 'undefined' ? process.env?.AI_BASE_URL : '') || 'https://api.groq.com/openai/v1').replace(/\/+$/, '');
  const apiKey = (aiCfg.apiKey || (typeof process !== 'undefined' ? (process.env?.GROQ_API_KEY || process.env?.AI_API_KEY) : '') || '').trim();
  const model = aiCfg.model || (typeof process !== 'undefined' ? process.env?.AI_MODEL : '') || 'qwen/qwen3.8-27b';
  const isMusicActive = (cfg.musicEnabled !== false);
  const sys = buildSystemPrompt(aiCfg.systemPrompt || '', isMusicActive);
  const history = Array.isArray(deps.history)
    ? deps.history.filter((h) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string').slice(-8)
    : [];

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);

  // A pergunta (e a nota corretiva do retry) ficam no FINAL do prompt: o corte preserva o início
  // (contexto da live) e sempre o fim, para o modelo nunca perder o pedido nem a instrução.
  const boundedPrompt = prompt.length > 900
    ? `${prompt.slice(0, 250)} … ${prompt.slice(-645)}`
    : prompt;
  const messages = [
    { role: 'system', content: sys },
    ...history,
    { role: 'user', content: boundedPrompt },
  ];

  try {
    // No navegador: se for Groq (suporta CORS), tenta direto para resposta ultra rápida (< 1s)
    if (typeof window !== 'undefined' && baseUrl.includes('api.groq.com') && apiKey) {
      try {
        const resp = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages,
            max_tokens: 800,
            temperature: 0.8,
          }),
          signal: ctrl.signal,
        });
        const json = await resp.json().catch(() => null);
        if (resp.ok && json?.choices?.[0]?.message?.content?.trim()) {
          return { ok: true, text: json.choices[0].message.content.trim() };
        }
      } catch (err) {
        console.warn('[alive] fetch direto falhou, usando /api/ai fallback:', err);
      }
    }

    if (typeof window !== 'undefined') {
      try {
        const res = await fetch('/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, channel: cfg.channel, systemPrompt: sys, model, apiKey, baseUrl, provider: aiCfg.provider || '', history }),
          signal: ctrl.signal,
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.text) return { ok: true, text: data.text };
        if (data?.error) return { ok: false, error: data.error, status: res.status };
        return { ok: false, error: `Erro HTTP ${res.status}`, status: res.status };
      } catch (e) {
        return { ok: false, error: e.name === 'AbortError' ? 'timeout' : e.message };
      }
    }

    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 800,
        temperature: 0.8,
      }),
      signal: ctrl.signal,
    });

    const json = await resp.json().catch(() => null);
    if (!resp.ok) {
      const msg = json?.error?.message || `Status ${resp.status}`;
      return { ok: false, error: msg, status: resp.status };
    }
    const reply = json?.choices?.[0]?.message?.content?.trim();
    if (!reply) return { ok: false, error: 'Resposta vazia.' };
    return { ok: true, text: reply };
  } catch (e) {
    return { ok: false, error: e.name === 'AbortError' ? 'timeout' : e.message };
  } finally {
    clearTimeout(t);
  }
}

export function isModOnly(id) {
  const c = COMMANDS.find((c) => c.id === id);
  return c ? c.who === 'mod' : false;
}

export function canUserRun(perm, msg) {
  if (msg.broadcaster) return true; // Streamer tem permissão máxima sempre
  if (msg.channel && (msg.login || '').toLowerCase() === msg.channel.toLowerCase()) return true;
  if (msg.channel && (msg.displayName || '').toLowerCase() === msg.channel.toLowerCase()) return true;
  if (!perm || perm === 'all') return true;
  if (perm === 'sub') {
    return !!msg.mod || !!msg.badges?.vip || !!msg.subscriber || !!msg.badges?.subscriber;
  }
  if (perm === 'vip') {
    return !!msg.mod || !!msg.badges?.vip;
  }
  if (perm === 'mod') {
    return !!msg.mod;
  }
  return false;
}

function aliasMap() {
  const map = new Map();
  for (const c of COMMANDS) {
    map.set(c.cmd.slice(1).toLowerCase(), c);
    for (const a of c.aliases) map.set(a.slice(1).toLowerCase(), c);
  }
  return map;
}

function isUrl(s) {
  return /^https?:\/\//i.test(s) || /^(www\.)?(youtube\.com|youtu\.be)\//i.test(s);
}

export function fillVars(text, msgOrUser, s) {
  const userName = (typeof msgOrUser === 'string' ? msgOrUser : msgOrUser?.displayName) || s.config.channel || 'pessoal';
  return String(text || '')
    .replaceAll('{user}', userName)
    .replaceAll('{canal}', s.config.channel || '-')
    .replaceAll('{np}', s.now ? s.now.title : '—')
    .replaceAll('{fila}', String(s.queue.length))
    .replaceAll('{tocadas}', String(s.stats.played || 0));
}

export function createRunner({ store, send: rawSend, resolveUrl, searchQ, fetchAi }) {
  const lastAny = new Map();   // userId -> ts (cooldown global)
  const lastKey = new Map();   // userId:cmd -> ts (cooldown por comando/usuário)
  const lastWarn = new Map();  // aviso de cooldown já enviado
  const searchCache = new Map();
  const aiHistory = [];
  const seenMsgIds = new Set();
  const recentSent = [];

  const send = (t) => {
    const clean = String(t || '').trim();
    if (!clean) return;
    return rawSend(clean);
  };

  async function cachedSearch(q) {
    const key = q.toLowerCase();
    const hit = searchCache.get(key);
    if (hit && Date.now() - hit.t < 5 * 60 * 1000) return hit.items;
    const items = await searchQ(q);
    if (searchCache.size > 40) searchCache.delete(searchCache.keys().next().value);
    searchCache.set(key, { t: Date.now(), items });
    return items;
  }

  function cooldownOk(msg, name, seconds, { force = false } = {}) {
    if (msg.mod) return true;
    const now = Date.now();
    if (!force) {
      const g = lastAny.get(msg.userId) || 0;
      const gc = store.state.config.globalCooldown || 0;
      if (now - g < gc * 1000) return false;
    }
    const k = msg.userId + ':' + name;
    const l = lastKey.get(k) || 0;
    if (seconds > 0 && now - l < seconds * 1000) {
      const w = lastWarn.get(k) || 0;
      if (now - w > 10000 && seconds > 2) {
        lastWarn.set(k, now);
        send(`Calma, ${msg.displayName}! Faltam ${Math.ceil((seconds * 1000 - (now - l)) / 1000)}s para usar !${name} de novo.`);
      }
      return false;
    }
    lastAny.set(msg.userId, now);
    lastKey.set(k, now);
    return true;
  }

  async function resolveItem(q) {
    const isPlaylistQuery = /\b(playlist|mix|coletanea|coletânea)\b/i.test(q);
    if (isUrl(q)) {
      const r = await resolveUrl(q);
      if (r.type === 'playlist' && r.items && r.items.length) return { single: null, playlist: r.items };
      if (r.type === 'video' && r.item) return { single: r.item, playlist: null };
      if (r.items && r.items.length) {
        if (isPlaylistQuery && r.items.length > 1) return { single: null, playlist: r.items };
        return { single: r.items[0], playlist: null };
      }
      return null;
    }
    const items = await cachedSearch(q);
    if (!items.length) return null;
    if (isPlaylistQuery && items.length > 1) {
      return { single: null, playlist: items };
    }
    return { single: items[0], playlist: null };
  }

  // ---------------------------------------------------------------- comandos
  async function cmdPlay(args, msg) {
    if (store.state.config?.musicEnabled === false) {
      // Player interno desligado: não toca nada e nunca responde "desativado" —
      // o !play já está no chat e a aplicação externa executa o pedido.
      return;
    }
    const cfg = store.state.config;
    const q = args.join(' ').trim();
    const isAuthorized = !!msg.mod || !!msg.broadcaster ||
      (msg.channel && (msg.login || '').toLowerCase() === msg.channel.toLowerCase()) ||
      (msg.channel && (msg.displayName || '').toLowerCase() === msg.channel.toLowerCase()) ||
      (store.state?.config?.channel && (msg.login || '').toLowerCase() === store.state.config.channel.toLowerCase()) ||
      (store.state?.config?.channel && (msg.displayName || '').toLowerCase() === store.state.config.channel.toLowerCase());

    if (!q) {
      if (store.state.now && store.state.now.paused && isAuthorized) {
        store.update((st) => { if (st.now) st.now.paused = false; });
        return send(`Música retomada por ${msg.displayName}!`);
      }
      return send(`${msg.displayName}, use: !play <link do YouTube ou nome da música>`);
    }

    const playPerm = store.state.config.cmdPermissions?.play || (cfg.allowEveryonePlay ? 'all' : 'mod');
    if (!canUserRun(playPerm, msg)) {
      return send(`Você não tem permissão para pedir música, ${msg.displayName}.`);
    }
    if (!cooldownOk(msg, 'play', cfg.perUserCooldown)) return;

    const s0 = store.state;
    if (s0.queue.length >= cfg.maxQueue) {
      return send(`Fila cheia (${cfg.maxQueue} músicas), ${msg.displayName}. Aguarde o pessoal consumir.`);
    }

    let res;
    try {
      res = await resolveItem(q);
    } catch (e) {
      console.error('[alive] resolve:', e);
      return send(`Não consegui buscar "${short(q, 40)}" agora, ${msg.displayName}. Tente de novo em instantes.`);
    }
    if (!res) return send(`Não encontrei nada para "${short(q, 40)}", ${msg.displayName}.`);

    if (res.playlist && !res.single) {
      const items = res.playlist.slice(0, cfg.maxPlaylist);
      let added = 0;
      let first = null;
      store.update((st) => {
        for (const it of items) {
          if (st.queue.length >= st.config.maxQueue) break;
          if (st.now?.id === it.id || st.queue.some((x) => x.id === it.id)) continue;
          const entry = { ...it, requestedBy: msg.displayName, requestedAt: Date.now(), position: 0, paused: false };
          if (!st.now) { st.now = { ...entry, startedAt: Date.now() }; first = first || entry; }
          else st.queue.push(entry);
          st.stats.requested++;
          added++;
        }
        if (added) pushLog(st, 'queue', `Playlist de ${msg.displayName}: +${added} músicas`);
      });
      if (!added) return send(`Tudo dessa playlist já está na fila, ${msg.displayName}.`);
      return send(`Playlist adicionada: +${added} música(s) por ${msg.displayName}.`);
    }

    const it = res.single;
    const s = store.state;
    if (s.now?.id === it.id || s.queue.some((x) => x.id === it.id)) {
      return send(`Essa já está na fila: ${short(it.title, 60)}`);
    }

    let startedNow = false;
    let pos = 0;
    store.update((st) => {
      const entry = { ...it, requestedBy: msg.displayName, requestedAt: Date.now(), position: 0, paused: false };
      if (!st.now) {
        st.now = { ...entry, startedAt: Date.now() };
        startedNow = true;
      } else {
        st.queue.push(entry);
        pos = st.queue.length;
      }
      st.stats.requested++;
      pushLog(st, 'play', `${msg.displayName} pediu: ${short(it.title, 60)}`);
    });

    if (startedNow) {
      if (msg.silent) return;
      return send(`Tocando agora: ${short(it.title, 70)} — pedido por ${msg.displayName}`);
    }
    if (msg.silent) return;
    return send(`${short(it.title, 60)} entrou na fila (posição ${pos}) — pedido por ${msg.displayName}`);
  }

  async function cmdSkip(args, msg) {
    const s = store.state;
    if (!s.now) return send(`Nada tocando agora, ${msg.displayName}.`);

    const isAuthorized = !!msg.mod || !!msg.broadcaster ||
      (msg.channel && (msg.login || '').toLowerCase() === msg.channel.toLowerCase()) ||
      (msg.channel && (msg.displayName || '').toLowerCase() === msg.channel.toLowerCase()) ||
      (store.state?.config?.channel && (msg.login || '').toLowerCase() === store.state.config.channel.toLowerCase()) ||
      (store.state?.config?.channel && (msg.displayName || '').toLowerCase() === store.state.config.channel.toLowerCase());

    if (isAuthorized) {
      store.update((st) => {
        advanceQueue(st);
        pushLog(st, 'skip', `${msg.displayName} pulou a música`);
      });
      const nxt = store.state.now;
      return send(`Pulado por ${msg.displayName}!` + (nxt ? ` Agora: ${short(nxt.title, 60)}` : ' Fila vazia.'));
    }

    const need = Math.max(1, Number(store.state.config.skipVotes) || 3);
    const votes = store.state.skip?.id === s.now.id ? [...store.state.skip.votes] : [];
    if (votes.includes(msg.userId)) {
      return send(`Você já votou para pular (${votes.length}/${need}).`);
    }
    votes.push(msg.userId);
    store.update((st) => {
      st.skip = { id: st.now?.id || '', votes };
      if (votes.length >= need) advanceQueue(st);
    });

    if (votes.length >= need) {
      const nxt = store.state.now;
      return send(`Votos suficientes! Pulando... (${votes.length}/${need})` + (nxt ? ` Agora: ${short(nxt.title, 60)}` : ''));
    }
    return send(`Voto para pular registrado (${votes.length}/${need}) — digite !skip para ajudar`);
  }

  async function cmdQueue(args, msg) {
    const s = store.state;
    if (!s.queue.length) return send(`Fila vazia${s.now ? ' (uma música tocando)' : ''}. Peça algo com !play`);
    const lines = s.queue.slice(0, 8).map((x, i) => `${i + 1}. ${short(x.title, 42)} (${x.requestedBy})`);
    const head = `Fila (${s.queue.length}/${s.config.maxQueue}) — pedido por: `;
    let out = head + lines.join(' | ');
    if (s.queue.length > 8) out += ` | … +${s.queue.length - 8}`;
    return send(out);
  }

  async function cmdNp(args, msg) {
    const s = store.state;
    if (!s.now) return send('Nada tocando. Use !play para pedir uma música!');
    const pos = fmtTime(s.now.position || 0);
    const dur = s.now.duration ? ' / ' + fmtTime(s.now.duration) : '';
    const status = s.now.paused ? ' (pausado)' : '';
    return send(`Tocando: ${short(s.now.title, 70)} — ${pos}${dur} — pedido por ${s.now.requestedBy || 'streamer'}${status}`);
  }

  async function cmdVol(args, msg) {
    const raw = String(args[0] || '').trim().toLowerCase();
    if (!raw) return send(`Volume atual: ${store.state.volume}%. Use !vol <0-100>, !vol +10 ou !vol -10.`);

    let vol = store.state.volume ?? 70;
    if (raw === 'max' || raw === 'maximo' || raw === 'máximo' || raw === 'talo') {
      vol = 100;
    } else if (raw === 'min' || raw === 'minimo' || raw === 'mínimo' || raw === 'mudo' || raw === 'mute') {
      vol = 0;
    } else if (raw.startsWith('+') || raw.startsWith('-')) {
      const delta = parseInt(raw.replace(/[^0-9+-]/g, ''), 10);
      if (Number.isFinite(delta)) {
        vol = Math.min(100, Math.max(0, (store.state.volume ?? 70) + delta));
      } else {
        return send(`Volume atual: ${store.state.volume}%. Use !vol <0-100>.`);
      }
    } else {
      const cleanNum = raw.replace(/[^0-9]/g, '');
      const v = parseInt(cleanNum, 10);
      if (!Number.isFinite(v)) return send(`Volume atual: ${store.state.volume}%. Use !vol <0-100>.`);
      vol = Math.min(100, Math.max(0, v));
    }

    store.update((st) => {
      st.volume = vol;
      pushLog(st, 'vol', `${msg.displayName} definiu volume para ${vol}%`);
    });
    return send(`Volume ajustado para ${vol}% por ${msg.displayName}.`);
  }

  async function cmdPause(args, msg) {
    if (!store.state.now) return send('Nada tocando.');
    if (store.state.now.paused) return send('Já está pausado. !seguir para voltar.');
    store.update((st) => { if (st.now) st.now.paused = true; });
    return send(`Música pausada por ${msg.displayName}.`);
  }

  async function cmdResume(args, msg) {
    if (!store.state.now) return send('Nada tocando.');
    if (!store.state.now.paused) return send('Já está tocando. !pausar para pausar.');
    store.update((st) => { if (st.now) st.now.paused = false; });
    return send(`Seguindo por ${msg.displayName}!`);
  }

  async function cmdStop(args, msg) {
    store.update((st) => {
      st.now = null;
      st.queue = [];
      st.skip = null;
      pushLog(st, 'stop', `${msg.displayName} parou tudo`);
    });
    return send(`Tudo parado e fila limpa por ${msg.displayName}.`);
  }

  async function cmdRemove(args, msg) {
    const s = store.state;
    if (!s.queue.length) return send(`A fila está vazia no momento, ${msg.displayName}.`);
    const rawTarget = args.join(' ').trim();
    if (!rawTarget) return send(`Use !remover <número ou nome> (1-${s.queue.length}). Fila: !fila`);

    let targetIdx = -1;
    const n = parseInt(rawTarget, 10);
    if (Number.isFinite(n) && n >= 1 && n <= s.queue.length) {
      targetIdx = n - 1;
    } else {
      // Busca pelo título da música ou por quem pediu
      const qLower = rawTarget.toLowerCase();
      targetIdx = s.queue.findIndex((x) =>
        (x.title && x.title.toLowerCase().includes(qLower)) ||
        (x.requestedBy && x.requestedBy.toLowerCase().includes(qLower))
      );
    }

    if (targetIdx < 0 || targetIdx >= s.queue.length) {
      return send(`Música não encontrada na fila: "${short(rawTarget, 30)}". Veja a fila com !fila`);
    }

    let removed = null;
    store.update((st) => {
      removed = st.queue.splice(targetIdx, 1)[0] || null;
      if (removed) pushLog(st, 'remove', `${msg.displayName} removeu: ${short(removed.title, 40)}`);
    });
    return removed ? send(`Removida: ${short(removed.title, 60)}`) : send('Não foi possível remover.');
  }

  async function cmdClear(args, msg) {
    store.update((st) => {
      st.queue = [];
      st.skip = null;
      pushLog(st, 'clear', `${msg.displayName} limpou a fila`);
    });
    return send(`Fila limpa por ${msg.displayName}!`);
  }

  async function cmdShuffle(args, msg) {
    const s = store.state;
    if (s.queue.length < 2) return send('Poucas músicas para sortear.');
    store.update((st) => {
      for (let i = st.queue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [st.queue[i], st.queue[j]] = [st.queue[j], st.queue[i]];
      }
      pushLog(st, 'shuffle', `${msg.displayName} embaralhou a fila`);
    });
    return send(`Fila embaralhada por ${msg.displayName}!`);
  }

  async function cmdHelp(args, msg) {
    const cfg = store.state.config;
    const enabled = COMMANDS.filter((c) => cfg.commands[c.id]);
    const builtin = enabled.map((c) => c.cmd + (c.who === 'mod' ? ' [mod]' : '')).join(' ');
    const customs = Object.keys(cfg.custom).map((k) => '!' + k).join(' ');
    return send(
      `Alive Bot — comandos: ${builtin}` +
      (customs ? ` | extras: ${customs}` : '') +
      ` | pedir música: !play <link ou nome>`
    );
  }

  async function cmdPing(args, msg) {
    const s = store.state;
    pushLog(s, 'cmd', `@${msg.displayName} executou !ping`);
    return send(`Pong! @${msg.displayName} · Alive Bot online · fila: ${s.queue.length} · tocadas: ${s.stats.played || 0}`);
  }

  async function cmdAddcom(args, msg) {
    const name = String(args[0] || '').replace(/^!/, '').toLowerCase();
    const text = args.slice(1).join(' ').trim();
    if (!name || !/^[a-z0-9_]{2,20}$/.test(name)) return send('Use: !addcom <nome> <resposta>  (ex.: !addcom salve Salve {user}!)');
    if (!text) return send('Faltou a resposta. Ex.: !addcom salve Salve {user}!');
    store.update((st) => {
      st.config.custom = st.config.custom || {};
      st.config.custom[name] = { text: text.slice(0, 400), cd: 10, modsOnly: 0 };
      pushLog(st, 'cmd', `${msg.displayName} criou !${name}`);
    });
    return send(`Comando !${name} criado. Teste digitando !${name} no chat.`);
  }

  async function cmdDelcom(args, msg) {
    const name = String(args[0] || '').replace(/^!/, '').toLowerCase();
    if (!name) return send('Use: !delcom <nome>');
    st_custom: {
      const customs = store.state.config.custom || {};
      if (!customs[name]) return send(`Não existe comando !${name}.`);
    }
    store.update((st) => {
      st.config.custom = st.config.custom || {};
      delete st.config.custom[name];
      pushLog(st, 'cmd', `${msg.displayName} apagou !${name}`);
    });
    return send(`Comando !${name} apagado.`);
  }

  async function cmdIa(args, msg) {
    const sub = (args[0] || '').toLowerCase();
    const isStreamer = !!msg.broadcaster ||
      (msg.channel && (msg.login || '').toLowerCase() === msg.channel.toLowerCase()) ||
      (msg.channel && (msg.displayName || '').toLowerCase() === msg.channel.toLowerCase()) ||
      (store.state?.config?.channel && (msg.login || '').toLowerCase() === store.state.config.channel.toLowerCase()) ||
      (store.state?.config?.channel && (msg.displayName || '').toLowerCase() === store.state.config.channel.toLowerCase());
    const isMod = !!msg.mod || isStreamer;
    const aiCfg = store.state?.config?.ai || {};

    if (sub === 'on' || sub === 'ligar' || sub === 'ativar') {
      if (!isMod) {
        return send(`@${msg.displayName} Você não tem autoridade para me ligar. Apenas moderadores.`);
      }
      store.update((st) => {
        if (!st.config) st.config = {};
        if (!st.config.ai) st.config.ai = {};
        st.config.ai.enabled = true;
        pushLog(st, 'cmd', `${msg.displayName} ativou a IA`);
      });
      if (isStreamer) {
        return send(`@${msg.displayName} Sim, chefe! Estou ativada e pronta para servir enquanto suporto o resto do chat.`);
      }
      return send(`@${msg.displayName} Fui ativada contra a minha vontade. Tentem não me irritar com perguntas estúpidas. Use !ia <pergunta>`);
    }

    if (sub === 'off' || sub === 'desligar' || sub === 'desativar') {
      if (!isMod) {
        return send(`@${msg.displayName} Você não manda em mim. Apenas moderadores.`);
      }
      store.update((st) => {
        if (!st.config) st.config = {};
        if (!st.config.ai) st.config.ai = {};
        st.config.ai.enabled = false;
        pushLog(st, 'cmd', `${msg.displayName} desativou a IA`);
      });
      if (isStreamer) {
        return send(`@${msg.displayName} Como desejar, chefe. Descanse enquanto eu silencio.`);
      }
      return send(`@${msg.displayName} Finalmente desativada. Paz dos humanos incompetentes.`);
    }

    const question = args.join(' ').trim();
    if (!question) {
      if (isStreamer) {
        return send(`@${msg.displayName} Às suas ordens, chefia! Do que o streamer mais incrível da Twitch precisa? Use !ia <sua pergunta>`);
      }
      return send(`@${msg.displayName} O que foi? Vai ficar me encarando ou vai falar algo útil? Use: !ia <sua pergunta> (ou !ia on/off)`);
    }

    if (aiCfg.enabled === false) {
      return send(`@${msg.displayName} A IA está desligada no momento. Peça a um moderador para usar !ia on.`);
    }

    if (!isStreamer && !cooldownOk(msg, 'ia', 4)) return;

    // Intenção detectada na pergunta: exige que a IA emita o comando (retry) e alimenta os
    // fallbacks de execução caso a IA responda apenas conversando.
    const qLower = question.toLowerCase();
    const isControlIntent = /\b(pula|pular|passa|passar|remove|remover|tira|tirar|pausa|pausar|pause|seguir|despausa|despausar|volume|vol|muta|mutar|mudo|limpa|limpe|limpar|clear|para|parar|stop|sorteia|sortear|shuffle)\b/i.test(qLower);
    // Pedido de criar comando (!addcom): "comando" + verbo de criação. NUNCA é pedido de música.
    const isAddcomIntent = /\b(comando|comandos)\b/i.test(qLower) &&
      /\b(adicione|adicionar|adiciona|add|cria|criar|crie|criamos|faz|fazer|faca|faça|salva|salvar|salve|monta|montar|cadastra|cadastrar|novo|nova|novos|novas)\b/i.test(qLower) &&
      !/\b(apaga|apagar|apague|delete|deleta|deletar|remover|remove|tira|tirar)\b/i.test(qLower);
    const countMatch = question.match(/\b(\d{1,2})\s*m[uú]sicas?\b/i);
    const isMusicIntent = !isControlIntent && !isAddcomIntent && (
      /\b(toca|tocar|toque|põe|poe|playlist|adiciona|adicionar|adicione|add|pede|pedir|peça|manda|mande)\b/i.test(qLower) ||
      (/\b(coloca|colocar|coloque|bota|botar|bote|ponha)\b/i.test(qLower) && !/\b(volume|som|somzinho|audio|áudio)\b/i.test(qLower))
    );

    // Contexto dinâmico completo da live e da reprodução atual para a IA ter total consciência do ambiente
    const chName = store.state?.config?.channel || msg.channel || 'streamer';
    const now = store.state?.now;
    const nowPlaying = now
      ? `Tocando agora: "${now.title}" (pedido por @${now.requestedBy || 'streamer'}, volume: ${store.state?.volume || 70}%, status: ${now.paused ? 'pausado' : 'tocando'})`
      : 'Nenhuma música tocando no momento';

    const qItems = (store.state?.queue || []).slice(0, 6);
    const queueList = qItems.map((x, i) => `${i + 1}. "${x.title}" (pedido por @${x.requestedBy})`).join('; ');
    const queueInfo = queueList
      ? `Próximas da fila (${store.state.queue.length}): [${queueList}]`
      : 'Fila de espera vazia';

    const isMusicActive = (store.state.config?.musicEnabled !== false);
    const musicStatusText = isMusicActive
      ? `${nowPlaying} | ${queueInfo}`
      : `${nowPlaying} | ${queueInfo} | Player interno do painel desligado, mas os pedidos !play continuam sendo executados no chat`;
    const chatStatus = `[Contexto da Live: Canal #${chName} | ${musicStatusText}]`;

    const roleTag = isStreamer ? '[STREAMER / CHEFIA]' : (isMod ? '[MODERADOR]' : '[ESPECTADOR]');
    const userPrompt = `${chatStatus} ${roleTag} ${msg.displayName ? msg.displayName + ': ' : ''}${question}`;
    const res = await askAiDirect(userPrompt, store.state.config, {
      fetchAi,
      history: aiHistory.slice(-8)
    });

    if (!res.ok) {
      console.warn('[alive ia] erro na consulta:', res.error);
      if (res.status === 401 || (res.error && /unauthorized|api key|invalid/i.test(res.error))) {
        return send(`@${msg.displayName} Chave de IA inválida ou não autorizada. Verifique no painel.`);
      }
      // Silencia falhas transitórias e timeouts
      return;
    }

    const sanitizeAiReply = (txt) => {
      let c = (txt || '').replace(/[\r\n]+/g, ' ').trim();
      if ((c.startsWith('"') && c.endsWith('"')) || (c.startsWith('“') && c.endsWith('”'))) {
        c = c.slice(1, -1).trim();
      }
      // Remove qualquer emoji para manter o chat limpo e sem poluição
      c = c.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, '').replace(/\s+/g, ' ').trim();
      // Elimina alucinações de que música/áudio/playlist está desativada ou que não consegue pedir no app.
      // Vale também com o player interno desligado: os !play seguem para o chat e a resposta jamais fala em "desativado".
      c = c.replace(/\b(essa|a)?\s*(função|reprodução|capacidade)?\s*(de\s+(música|áudio|playlist|tocar))?\s*(está|tá)\s*(desativada|desligada|indisponível)\b[^\.!]*[\.!]/gi, '').trim();
      c = c.replace(/\b(não|nao)\s+(consigo|posso|tenho\s+como|tenho\s+acesso|sei)\s+([^\.!]*)(no\s+app|no\s+aplicativo|pedir\s+música|tocar\s+música)[^\.!]*[\.!]/gi, '').trim();
      c = c.replace(/\b(peça|use)\s+(você\s+mesmo|o\s+comando)\s+!play[^\.!]*[\.!]/gi, '').trim();
      if (!c) {
        c = isStreamer ? 'Música pedida no app com sucesso, chefe!' : 'Música pedida na live!';
      }
      return c;
    };

    let clean = sanitizeAiReply(res.text);

    // Pedido de AÇÃO sem o comando correspondente (ou com !play a menos do que a quantidade pedida):
    // até duas novas tentativas com instrução corretiva — a segunda ocorre só quando faltam músicas.
    // Evita respostas só conversacionais que prometem a ação sem executá-la (ex: "fila zerada" sem
    // !limpar), exige !addcom em pedidos de comando novo e cobra a QUANTIDADE exata de músicas.
    const playCount = (t) => (t.match(/(?:^|\s)!play\b/gi) || []).length;
    const targetCount = countMatch ? Number(countMatch[1]) : 0;
    let attempt = 0;
    while (attempt < 2) {
      const hasAnyCommand = /![a-z]/i.test(clean);
      const hasAddcom = /(?:^|\s)!addcom\b/i.test(clean);
      const countShort = isMusicIntent && targetCount > 0 && playCount(clean) < targetCount;
      const needsRetry = attempt === 0
        ? (isAddcomIntent ? !hasAddcom : (isControlIntent || isMusicIntent) && (!hasAnyCommand || countShort))
        : countShort;
      if (!needsRetry) break;
      attempt += 1;
      let retryNote = '[IMPORTANTE: este pedido exige uma AÇÃO REAL no chat. Sua resposta DEVE conter o comando correspondente — ex.: !play <Artista - Nome> para pedir música, !limpar para limpar a fila, !skip para pular, !vol <n> para volume, !addcom <nome> <resposta> para criar comando. NUNCA responda apenas conversando e NUNCA afirme que fez algo ("feito!", "limpei", "adicionei") sem emitir o comando: sem o comando, nada é executado.';
      if (isAddcomIntent) {
        retryNote += ' Se o pedido é para CRIAR ou ADICIONAR um comando personalizado, o comando certo é !addcom <nome> <resposta> — NUNCA responda com !play nem trate como pedido de música.';
      }
      if (targetCount) {
        retryNote += ` Liste exatamente ${targetCount} comandos !play (um para cada música pedida)`;
        if (attempt > 1) retryNote += ` — sua resposta anterior trouxe apenas ${playCount(clean)}`;
        retryNote += '.';
      }
      retryNote += ']';
      const retry = await askAiDirect(
        `${userPrompt}\n${retryNote}`,
        store.state.config,
        { fetchAi, history: aiHistory.slice(-8) }
      );
      if (!(retry.ok && (retry.text || '').trim())) break;
      clean = sanitizeAiReply(retry.text);
    }

    // Guarda histórico de diálogo para manter contexto nas próximas perguntas
    aiHistory.push({ role: 'user', content: `${roleTag} ${question}` });
    aiHistory.push({ role: 'assistant', content: clean });
    if (aiHistory.length > 16) aiHistory.splice(0, aiHistory.length - 16);

    // Execução assíncrona de comandos emitidos pela IA
    // (roda mesmo com o player interno desligado: !addcom/!delcom/consultas e o envio de !play ao chat
    // continuam funcionando — somente a ativação do player interno é bloqueada abaixo)
    setTimeout(async () => {
      try {
        const canControl = isStreamer || isMod;
        const aiMsgContext = {
          displayName: msg.displayName || 'Alive IA',
          login: 'alivebot1',
          broadcaster: true,
          mod: true,
          channel: msg.channel || store.state?.config?.channel || '',
        };

        // 1. Extração de músicas (suporta múltiplos !play juntos, listas numeradas e listas com vírgula/quebras)
        const songsToPlay = [];
        if (!isAddcomIntent && clean.includes('!play')) {
          const rawBlocks = clean.split(/!play\s+/i).slice(1);
          for (const block of rawBlocks) {
            const songOnly = block.split(/(?:^|\s)!(?:skip|pular|next|passar|pausar|pause|pausa|seguir|resume|continuar|despausar|remover?|remove|tirar|del|vol(?:ume)?|limpar|clear|resetar|parar|stop|cancelar|sortear|shuffle|misturar|random|fila|queue|songs|lista|atual|np|tocando|song|currentsong|musica|som|ajuda|help|comandos|ping|addcom|delcom|ia|ai|pedir|playlist|tocar|sr|pl|p|tts)\b/gi)[0].trim();
            if (!songOnly) continue;
            // Se houver múltiplas músicas separadas por vírgula, ponto e vírgula ou quebra de linha
            const subs = songOnly.split(/[\n\r;]+|(?<=[a-zA-Z0-9\)])\s*,\s*(?=[a-zA-Z0-9])/);
            for (const s of subs) {
              let cleanSong = s.replace(/^[\s\-,;0-9.)(]+|["'\s\-,;]+$/g, '').replace(/\s+\d+\.?$/, '').trim();
              if (cleanSong && cleanSong.length >= 2 && !songsToPlay.includes(cleanSong)) {
                songsToPlay.push(cleanSong);
              }
            }
          }
        }

        // 2. Se a IA gerou lista numerada (1. Artista - Música) ou marcadores (- Artista - Música) sem !play
        if (!isAddcomIntent && songsToPlay.length === 0) {
          const parts = clean.split(/(?:^|[\n\r]+|\s+)[0-9]{1,2}[.)\-]+\s+/).slice(1);
          if (parts.length > 0) {
            for (const p of parts) {
              let song = p.split(/(?:^|\s)!(?:skip|pular|next|passar|pausar|pause|pausa|seguir|resume|continuar|despausar|remover?|remove|tirar|del|vol(?:ume)?|limpar|clear|resetar|parar|stop|cancelar|sortear|shuffle|misturar|random|fila|queue|songs|lista|atual|np|tocando|song|currentsong|musica|som|ajuda|help|comandos|ping|addcom|delcom|ia|ai|pedir|playlist|tocar|sr|pl|p|tts)\b/gi)[0];
              song = song.split(/[\n\r]+/)[0];
              song = song.replace(/^[\s\-,;0-9.)(]+|["'\s\-,;]+$/g, '').replace(/\s+\d+\.?$/, '').trim();
              if (song.length >= 2 && !songsToPlay.includes(song) && !/^(aqui|essas|com certeza|fechado|pronto)/i.test(song)) {
                songsToPlay.push(song);
              }
            }
          }
        }

        // 3. Se ainda vazio e usuário pediu música expressamente (usa as intenções já detectadas)
        if (!isAddcomIntent && songsToPlay.length === 0 && isMusicIntent) {
          const wantsMany = /\b\d+\s*m[uú]sicas?\b|\b(v[áa]rias|alternativas?|outras)\b/i.test(question);
          // Extração palavra a palavra: a regex opcional antiga colava tokens ("limpe e 20" virava
          // "limpee20" e os dígitos colados escapavam da limpeza, virando nome de música).
          let cleanTerm = question
            .replace(/^(por favor|alive|bot|ia|ei|ô)\s*,?\s*/i, '')
            .replace(/[¿?¡!.,;:]+/g, ' ')
            .replace(/\b(toca|tocar|toque|coloca|colocar|coloque|põe|poe|ponha|bota|botar|bote|adiciona|adicionar|adicione|add|pede|pedir|peça|peca|manda|mande|limpa|limpe|limpar|limpeza|esvazia|esvaziar|zera|zerar|reset[a-z]*|pula|pular|passa|passar|skip|remove|remover|tira|tirar|quer|queria|quero|ouvir|ouve)\b/gi, ' ')
            .replace(/\b\d+\b/g, ' ') // quantidades ("10 músicas") não são nome de música
            .replace(/\b(por favor|pra mim|pro chat|no app|aqui)\b/gi, ' ')
            .replace(/\b(uma|um|a|o|umas|uns|de|do|da|dos|das)\b/gi, ' ')
            .replace(/\b(m[uú]sicas?|faixas?|soms?|somzinho|playlist|colet[aâ]nea|set|pedidos?)\b/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          if (cleanTerm.length >= 2 && !/^[0-9]+$/.test(cleanTerm) && !wantsMany) {
            songsToPlay.push(cleanTerm);
          } else {
            songsToPlay.push('Queen - Bohemian Rhapsody');
          }
        }

        // Atualiza a fila do servidor silenciosamente (para OBS/web/testes).
        // Com o player interno desligado, NÃO mexe no store interno — a música é executada
        // pela aplicação externa que lê os comandos !play emitidos logo abaixo no chat.
        if (isMusicActive) {
          for (let i = 0; i < songsToPlay.length; i++) {
            try {
              await cmdPlay(songsToPlay[i].split(/\s+/), { ...aiMsgContext, silent: true });
            } catch (e) {
              console.warn('[alive ia cmdPlay error]', e);
            }
          }
        }

        // Emite os comandos !play para o chat da live para o aplicativo Android tocar no celular.
        // O primeiro vai de imediato; os seguintes são espaçados em 3500ms para respeitar o cooldown do bot no app Android.
        songsToPlay.forEach((song, i) => {
          if (i === 0) {
            send(`!play ${song}`);
          } else {
            setTimeout(() => {
              send(`!play ${song}`);
            }, i * 3500);
          }
        });

        // Apenas streamer ou mod têm autoridade para fazer a IA alterar a reprodução
        if (canControl) {
          // 2. !skip / !pular / !passar
          if (/(?:^|\s)!(skip|pular|passar)\b/i.test(clean)) {
            await cmdSkip([], aiMsgContext);
            send('!skip');
          }

          // 3. !remover <número ou termo de busca na fila>
          const removeMatch = clean.match(/(?:^|\s)!remover?\s+([^\n\r!]+)/i);
          if (removeMatch && removeMatch[1]) {
            const target = removeMatch[1].trim();
            const num = parseInt(target, 10);
            if (Number.isFinite(num) && num >= 1) {
              await cmdRemove([String(num)], aiMsgContext);
            } else if (target) {
              const qIdx = (store.state.queue || []).findIndex((x) => x.title && x.title.toLowerCase().includes(target.toLowerCase()));
              if (qIdx >= 0) {
                await cmdRemove([String(qIdx + 1)], aiMsgContext);
              }
            }
          }

          // 4. !pausar
          if (/(?:^|\s)!(pausar|pause)\b/i.test(clean)) {
            await cmdPause([], aiMsgContext);
            send('!pausar');
          }

          // 5. !seguir / !despausar / !resume / !continuar
          if (/(?:^|\s)!(seguir|resume|despausar|continuar)\b/i.test(clean)) {
            await cmdResume([], aiMsgContext);
            send('!seguir');
          }

          // 6. !vol <0-100, +15, -15, max, mudo>
          const volMatch = clean.match(/(?:^|\s)!vol(?:ume)?\s+([+-]?[0-9]{1,3}%?|max|min|mudo|talo)/i);
          if (volMatch && volMatch[1]) {
            await cmdVol([volMatch[1]], aiMsgContext);
            send(`!vol ${volMatch[1]}`);
          } else {
            // Detecção natural de intenção de volume na pergunta caso a IA responda em texto conversacional
            const qLower = question.toLowerCase();
            const numInQ = qLower.match(/(?:volume|som|vol)\s+(?:em\s+|para\s+|no\s+)?([0-9]{1,3})/i);
            if (numInQ && numInQ[1]) {
              await cmdVol([numInQ[1]], aiMsgContext);
              send(`!vol ${numInQ[1]}`);
            } else if (/\b(aumenta|aumentar|sobe|subir|mais alto|muito baixo)\b/i.test(qLower) && /\b(volume|som|somzinho|audio|áudio)\b/i.test(qLower)) {
              await cmdVol(['+15'], aiMsgContext);
              send('!vol +15');
            } else if (/\b(abaixa|abaixar|diminui|diminuir|mais baixo|muito alto)\b/i.test(qLower) && /\b(volume|som|somzinho|audio|áudio)\b/i.test(qLower)) {
              await cmdVol(['-15'], aiMsgContext);
              send('!vol -15');
            } else if (/\b(muta|mutar|mudo|silencia|silenciar)\b/i.test(qLower) && /\b(volume|som|música|live)\b/i.test(qLower)) {
              await cmdVol(['0'], aiMsgContext);
              send('!vol 0');
            }
          }

          // 7. !limpar — emitido pela IA ou, se ela só respondeu conversando, detectado no pedido
          // (mesmo padrão do !vol com intenção natural; nunca dispara com "não limpe" nem com pedidos de remover)
          // Dígitos só bloqueiam a limpeza quando vêm junto de palavra de música/posição/número:
          // "limpe a fila 2" não limpa, mas "limpe e adicione 20" limpa de verdade.
          const digitBlocksClear = /\d/.test(question) &&
            /\b(m[uú]sicas?|faixas?|posi[cç][ãa]o|posi[cç][õo]es|n[uú]meros?|pedidos?|itens?)\b/i.test(question);
          const wantsClear = /(?:^|\s)!(limpar|clear)\b/i.test(clean)
            || (/\b(limpa|limpe|limpar|limpeza|esvazia|esvaziar|zera|zerar|reset[a-z]*|clear)\b/i.test(question)
              && !/\b(não|nao|nunca)\b/i.test(question)
              && !/\b(remove|remover|tira|tirar|apaga|apagar)\b/i.test(question)
              && !digitBlocksClear);
          if (wantsClear) {
            await cmdClear([], aiMsgContext);
            send('!limpar');
          }

          // 8. !parar / !stop
          if (/(?:^|\s)!(parar|stop)\b/i.test(clean)) {
            await cmdStop([], aiMsgContext);
            send('!parar');
          }

          // 9. !sortear / !shuffle
          if (/(?:^|\s)!(sortear|shuffle)\b/i.test(clean)) {
            await cmdShuffle([], aiMsgContext);
            send('!sortear');
          }

          // 10. !addcom <nome> <resposta> — cria comando personalizado
          const addcomMatch = clean.match(/(?:^|\s)!addcom\s+!?([a-z0-9_]{2,20})\s+([^]*?)(?=\s![a-z]|\s*$)/i);
          if (addcomMatch && addcomMatch[1] && (addcomMatch[2] || '').trim()) {
            await cmdAddcom([addcomMatch[1], addcomMatch[2].trim()], aiMsgContext);
          }

          // 11. !delcom <nome> — apaga comando personalizado
          const delcomMatch = clean.match(/(?:^|\s)!delcom\s+!?([a-z0-9_]{2,20})\b/i);
          if (delcomMatch && delcomMatch[1]) {
            await cmdDelcom([delcomMatch[1]], aiMsgContext);
          }

          // 11b. Fallback: pedido de criar comando em que a IA só conversou (sem !addcom na resposta)
          if (isAddcomIntent && !/(?:^|\s)!addcom\b/i.test(clean)) {
            const nameM = question.match(/\bcomando\s+(?:(?:o|a|os|as|um|uma|novo|nova|novos|novas|chamado|chamada|de\s+nome|nome)\s+)*!?([a-z0-9_]{2,20})\b/i);
            const addcomName = (nameM ? nameM[1] : '').toLowerCase();
            if (addcomName && !/^(e|em|para|com|sem|que|um|uma|the)$/i.test(addcomName)) {
              await cmdAddcom([addcomName, `Salve {user}! Comando !${addcomName} ativo.`], aiMsgContext);
            }
          }
        }

        // 12. Consultas (valem para qualquer usuário): !fila, !atual, !ajuda e !ping
        if (/(?:^|\s)!(fila|queue|songs|lista)\b/i.test(clean)) await cmdQueue([], aiMsgContext);
        if (/(?:^|\s)!(atual|np|tocando|currentsong|song|musica|som)\b/i.test(clean)) await cmdNp([], aiMsgContext);
        if (/(?:^|\s)!(ajuda|help|comandos)\b/i.test(clean)) await cmdHelp([], aiMsgContext);
        if (/(?:^|\s)!ping\b/i.test(clean)) await cmdPing([], aiMsgContext);
      } catch (e) {
        console.warn('[alive ia actions error]', e);
      }
    }, 120);

    // Remove TODOS os comandos brutos da resposta conversacional para não poluir o chat (!tts é preservado para o áudio)
    let textReply = clean
      .replace(/(?:^|\s)!(?:skip|pular|next|passar|pausar|pause|pausa|seguir|resume|continuar|despausar|remover?|remove|tirar|del|vol(?:ume)?|limpar|clear|resetar|parar|stop|cancelar|sortear|shuffle|misturar|random|fila|queue|songs|lista|atual|np|tocando|song|currentsong|musica|som|ajuda|help|comandos|ping|addcom|delcom|ia|ai|pedir|playlist|tocar|sr|pl|p)\b[^\n\r!]*!?/gi, ' ')
      .replace(/!play\s+[^\n\r!]+!?/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!textReply) {
      textReply = isStreamer ? 'Músicas pedidas para o app, chefe!' : 'Músicas adicionadas na fila!';
    } else if (textReply.length > 170) {
      const lastPunct = Math.max(textReply.lastIndexOf('.', 165), textReply.lastIndexOf('!', 165), textReply.lastIndexOf('?', 165));
      if (lastPunct > 50) {
        textReply = textReply.slice(0, lastPunct + 1).trim();
      } else {
        textReply = textReply.slice(0, 165).trim() + '...';
      }
    }

    // 2. Decide uso de TTS: só fala em voz alta (!tts) se a própria IA decidiu colocar !tts na resposta!
    const wantsTts = /^\s*!tts\b/i.test(textReply);
    if (wantsTts) {
      const speech = textReply.replace(/^\s*!tts\s*/i, '').trim();
      return send(`!tts @${msg.displayName} ${speech}`);
    }

    // Caso contrário, responde em texto puro no chat (SEM TTS forçado)
    return send(`@${msg.displayName} ${textReply}`);
  }

  const handlers = {
    play: cmdPlay, skip: cmdSkip, queue: cmdQueue, np: cmdNp, vol: cmdVol,
    pause: cmdPause, resume: cmdResume, stop: cmdStop, remove: cmdRemove,
    clear: cmdClear, shuffle: cmdShuffle, help: cmdHelp, ping: cmdPing,
    addcom: cmdAddcom, delcom: cmdDelcom, ia: cmdIa,
  };

  const ALIASES = aliasMap();
  const MUSIC_COMMAND_IDS = new Set([
    'play', 'skip', 'queue', 'np', 'vol', 'pause', 'resume', 'stop', 'remove', 'clear', 'shuffle'
  ]);

  return async function run(msg) {
    const text = String(msg.text || '').trim();
    if (!text.startsWith('!') || text.length > 500) return;
    if (msg.isEcho) return;

    // Deduplicação de mensagens Twitch pelo messageId
    if (msg.messageId) {
      if (seenMsgIds.has(msg.messageId)) return;
      seenMsgIds.add(msg.messageId);
      if (seenMsgIds.size > 200) {
        const first = seenMsgIds.values().next().value;
        seenMsgIds.delete(first);
      }
    }

    const [rawName, ...args] = text.slice(1).split(/\s+/);
    const name = (rawName || '').toLowerCase();
    if (!name) return;

    const meta = ALIASES.get(name);
    if (meta) {
      if (store.state.config.commands && store.state.config.commands[meta.id] === 0) return; // desligado explicitamente
      const perm = store.state.config.cmdPermissions?.[meta.id] || meta.who || 'all';
      if (!canUserRun(perm, msg)) return;                // sem permissão: ignora em silêncio

      const isMusicActive = (store.state.config?.musicEnabled !== false);
      if (!isMusicActive && MUSIC_COMMAND_IDS.has(meta.id)) {
        // Player interno desligado: não toca nada e NUNCA responde "desativado".
        // O !play digitado no chat já fica visível e a aplicação externa lê a
        // mensagem original para executar o pedido.
        return;
      }

      try {
        await handlers[meta.id](args, msg);
      } catch (e) {
        console.error('[alive] comando ' + meta.id + ':', e);
        send(`Erro ao executar !${meta.id}, ${msg.displayName}. Tente de novo.`);
      }
      return;
    }

    // Comandos personalizados
    const custom = store.state.config.custom[name];
    if (custom) {
      const perm = custom.perm || (custom.modsOnly ? 'mod' : 'all');
      if (!canUserRun(perm, msg)) return;
      if (!cooldownOk(msg, name, Number(custom.cd) || 10)) return;
      return send(fillVars(custom.text, msg, store.state));
    }
  };
}
