// Alive Bot — módulo i18n isomórfico (pt | en | es) para Painel, Widget, Comandos e IA.
// Sem APIs exclusivas do browser: funciona tanto no navegador quanto no Node.js.

export const SUPPORTED_LANGS = ['pt', 'en', 'es'];

export function normalizeLang(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (s.startsWith('en')) return 'en';
  if (s.startsWith('es')) return 'es';
  return 'pt';
}

export const DICT = {
  pt: {
    // Widget OBS
    widget_idle_kicker: 'ALIVE BOT · AGUARDANDO',
    widget_idle_title: 'Fila vazia',
    widget_idle_sub: 'Peça no chat com <b>!play &lt;nome da música&gt;</b>',
    widget_unmute: 'Clique para ativar o áudio',
    widget_next_head: 'PRÓXIMAS DA FILA',
    widget_hint: 'Peça uma música no chat com <b>!play</b>',
    widget_playing: 'TOCANDO AGORA',
    widget_paused: 'PAUSADO',
    widget_muted: 'MUDO',
    widget_requested_by: 'pedido por ',
    widget_toast_added: 'Nova música na fila: {title}{by}',
    widget_toast_alt: 'Tocando versão liberada: {title}',

    // Comandos do chat
    cmd_disabled: '@{user}, o comando !{cmd} está desativado no momento.',
    cmd_mod_only: '@{user}, apenas moderadores podem usar !{cmd}.',
    cmd_cooldown: '@{user}, aguarde {s}s para usar !{cmd} de novo.',
    cmd_play_usage: '@{user}, use !play <nome da música ou link do YouTube>.',
    cmd_play_no_everyone: '@{user}, apenas moderadores podem pedir músicas agora.',
    cmd_play_unpaused: '@{user}, música retomada: {title}.',
    cmd_play_queue_full: '@{user}, a fila já atingiu o limite de {max} músicas.',
    cmd_play_not_found: '@{user}, não encontrei nada para "{q}".',
    cmd_play_playlist_added: '@{user}, {n} música(s) da playlist adicionada(s) à fila!{extra}',
    cmd_play_playlist_now: '@{user}, tocando agora da playlist: {title} (+{n} na fila).',
    cmd_play_now: 'Tocando agora: {title} (pedido por @{user}).',
    cmd_play_queued: '@{user}, "{title}" entrou na fila na posição #{pos}.',
    cmd_skip_empty: '@{user}, não há nenhuma música tocando agora.',
    cmd_skip_mod: '@{user} pulou a música. {next}',
    cmd_skip_next: 'Tocando agora: {title}.',
    cmd_skip_ended: 'Fim da fila.',
    cmd_skip_already: '@{user}, você já votou para pular ({votes}/{need}).',
    cmd_skip_voted: '@{user} votou para pular ({votes}/{need}).',
    cmd_skip_passed: 'Votação atingida ({votes}/{need})! Pulando para: {next}',
    cmd_queue_empty: '@{user}, a fila está vazia. Use !play <música>!',
    cmd_queue_list: 'Fila ({total}): {items}{more}',
    cmd_queue_more: ' (+{n} mais)',
    cmd_np_empty: '@{user}, nenhuma música tocando no momento.',
    cmd_np_paused: ' (pausada)',
    cmd_np_now: 'Tocando agora: {title}{paused} — pedido por @{user}.',
    cmd_vol_current: '@{user}, volume atual: {vol}%.',
    cmd_vol_set: '@{user}, volume ajustado para {vol}%.',
    cmd_pause_empty: '@{user}, nenhuma música tocando.',
    cmd_pause_ok: '@{user} pausou a música.',
    cmd_resume_empty: '@{user}, nenhuma música tocando.',
    cmd_resume_ok: '@{user} retomou a música.',
    cmd_stop_ok: '@{user} parou a reprodução e limpou a fila.',
    cmd_clear_empty: '@{user}, a fila já está vazia.',
    cmd_clear_ok: '@{user} limpou {n} música(s) da fila.',
    cmd_shuffle_empty: '@{user}, precisa de pelo menos 2 músicas na fila para sortear.',
    cmd_shuffle_ok: '@{user} embaralhou a fila ({n} músicas).',
    cmd_remove_usage: '@{user}, use !remover <posição ou nome>.',
    cmd_remove_not_found: '@{user}, não encontrei nenhuma música correspondente na fila.',
    cmd_remove_ok: '@{user} removeu "{title}" da fila.',
    cmd_ping: '@{user}, pong! Alive Bot online.',
    cmd_help: 'Comandos: {cmds}',
    cmd_addcom_usage: '@{user}, use !addcom <!nome> <resposta>.',
    cmd_addcom_ok: '@{user}, comando !{name} salvo!',
    cmd_delcom_usage: '@{user}, use !delcom <!nome>.',
    cmd_delcom_not_found: '@{user}, comando !{name} não encontrado.',
    cmd_delcom_ok: '@{user}, comando !{name} removido.',
    cmd_ia_disabled: '@{user}, a IA está desligada. Um moderador pode ligar com !ia on.',
    cmd_ia_on: 'IA ativada no chat! Podem mandar suas perguntas — se tiverem coragem.',
    cmd_ia_off: 'IA desativada. Finalmente um pouco de paz neste chat.',
    cmd_ia_usage: '@{user}, use !ia <pergunta> (ou !ia on / !ia off para mods).',
    cmd_ia_no_key: '@{user}, a IA está sem chave configurada no painel.',
    cmd_ia_error: '@{user}, a IA falhou agora ({err}).',
    cmd_ia_ctx_streamer: '[STREAMER / SEU MESTRE]',
    cmd_ia_ctx_mod: '[MODERADOR]',
    cmd_ia_ctx_viewer: '[ESPECTADOR]',
    cmd_ia_ctx_now: 'Tocando agora',
    cmd_ia_ctx_none: 'Nenhuma',
    cmd_ia_ctx_queue: 'Próximas da fila',
    cmd_ia_ctx_vol: 'Volume atual',

    // Anúncios automáticos do bot IRC/Discord
    irc_announce_now: 'Tocando agora: {title} (pedido por @{user})',
    irc_announce_queue: 'Na fila (#{pos}): {title} (pedido por @{user})',
  },

  en: {
    // Widget OBS
    widget_idle_kicker: 'ALIVE BOT · STANDBY',
    widget_idle_title: 'Queue is empty',
    widget_idle_sub: 'Request in chat with <b>!play &lt;song name&gt;</b>',
    widget_unmute: 'Click to enable audio',
    widget_next_head: 'UP NEXT',
    widget_hint: 'Request a song in chat with <b>!play</b>',
    widget_playing: 'NOW PLAYING',
    widget_paused: 'PAUSED',
    widget_muted: 'MUTED',
    widget_requested_by: 'requested by ',
    widget_toast_added: 'Added to queue: {title}{by}',
    widget_toast_alt: 'Playing available version: {title}',

    // Chat commands
    cmd_disabled: '@{user}, command !{cmd} is currently disabled.',
    cmd_mod_only: '@{user}, only moderators can use !{cmd}.',
    cmd_cooldown: '@{user}, please wait {s}s before using !{cmd} again.',
    cmd_play_usage: '@{user}, use !play <song name or YouTube link>.',
    cmd_play_no_everyone: '@{user}, only moderators can request songs right now.',
    cmd_play_unpaused: '@{user}, resumed playback: {title}.',
    cmd_play_queue_full: '@{user}, the queue has reached the limit of {max} songs.',
    cmd_play_not_found: '@{user}, could not find anything for "{q}".',
    cmd_play_playlist_added: '@{user}, added {n} song(s) from the playlist to the queue!{extra}',
    cmd_play_playlist_now: '@{user}, now playing from playlist: {title} (+{n} in queue).',
    cmd_play_now: 'Now playing: {title} (requested by @{user}).',
    cmd_play_queued: '@{user}, "{title}" added to queue at position #{pos}.',
    cmd_skip_empty: '@{user}, no song is currently playing.',
    cmd_skip_mod: '@{user} skipped the song. {next}',
    cmd_skip_next: 'Now playing: {title}.',
    cmd_skip_ended: 'End of queue.',
    cmd_skip_already: '@{user}, you already voted to skip ({votes}/{need}).',
    cmd_skip_voted: '@{user} voted to skip ({votes}/{need}).',
    cmd_skip_passed: 'Skip vote passed ({votes}/{need})! Next: {next}',
    cmd_queue_empty: '@{user}, the queue is empty. Use !play <song>!',
    cmd_queue_list: 'Queue ({total}): {items}{more}',
    cmd_queue_more: ' (+{n} more)',
    cmd_np_empty: '@{user}, nothing is playing right now.',
    cmd_np_paused: ' (paused)',
    cmd_np_now: 'Now playing: {title}{paused} — requested by @{user}.',
    cmd_vol_current: '@{user}, current volume: {vol}%.',
    cmd_vol_set: '@{user}, volume set to {vol}%.',
    cmd_pause_empty: '@{user}, nothing is playing.',
    cmd_pause_ok: '@{user} paused playback.',
    cmd_resume_empty: '@{user}, nothing is playing.',
    cmd_resume_ok: '@{user} resumed playback.',
    cmd_stop_ok: '@{user} stopped playback and cleared the queue.',
    cmd_clear_empty: '@{user}, the queue is already empty.',
    cmd_clear_ok: '@{user} cleared {n} song(s) from the queue.',
    cmd_shuffle_empty: '@{user}, need at least 2 songs in the queue to shuffle.',
    cmd_shuffle_ok: '@{user} shuffled the queue ({n} songs).',
    cmd_remove_usage: '@{user}, use !remove <position or name>.',
    cmd_remove_not_found: '@{user}, could not find a matching song in the queue.',
    cmd_remove_ok: '@{user} removed "{title}" from the queue.',
    cmd_ping: '@{user}, pong! Alive Bot is online.',
    cmd_help: 'Commands: {cmds}',
    cmd_addcom_usage: '@{user}, use !addcom <!name> <reply>.',
    cmd_addcom_ok: '@{user}, command !{name} saved!',
    cmd_delcom_usage: '@{user}, use !delcom <!name>.',
    cmd_delcom_not_found: '@{user}, command !{name} not found.',
    cmd_delcom_ok: '@{user}, command !{name} removed.',
    cmd_ia_disabled: '@{user}, AI is disabled. A moderator can enable it with !ia on.',
    cmd_ia_on: 'AI enabled in chat! Ask away — if you dare.',
    cmd_ia_off: 'AI disabled. Finally some peace in this chat.',
    cmd_ia_usage: '@{user}, use !ia <question> (or !ia on / !ia off for mods).',
    cmd_ia_no_key: '@{user}, AI API key is not configured in the panel.',
    cmd_ia_error: '@{user}, AI failed right now ({err}).',
    cmd_ia_ctx_streamer: '[STREAMER / YOUR MASTER]',
    cmd_ia_ctx_mod: '[MODERATOR]',
    cmd_ia_ctx_viewer: '[VIEWER]',
    cmd_ia_ctx_now: 'Now playing',
    cmd_ia_ctx_none: 'None',
    cmd_ia_ctx_queue: 'Up next',
    cmd_ia_ctx_vol: 'Current volume',

    irc_announce_now: 'Now playing: {title} (requested by @{user})',
    irc_announce_queue: 'Queued (#{pos}): {title} (requested by @{user})',
  },

  es: {
    // Widget OBS
    widget_idle_kicker: 'ALIVE BOT · EN ESPERA',
    widget_idle_title: 'Cola vacía',
    widget_idle_sub: 'Pide en el chat con <b>!play &lt;nombre de la canción&gt;</b>',
    widget_unmute: 'Haz clic para activar el audio',
    widget_next_head: 'SIGUIENTES EN LA COLA',
    widget_hint: 'Pide una canción en el chat con <b>!play</b>',
    widget_playing: 'REPRODUCIENDO',
    widget_paused: 'EN PAUSA',
    widget_muted: 'SILENCIO',
    widget_requested_by: 'pedido por ',
    widget_toast_added: 'Nueva canción en cola: {title}{by}',
    widget_toast_alt: 'Reproduciendo versión disponible: {title}',

    // Comandos del chat
    cmd_disabled: '@{user}, el comando !{cmd} está desactivado en este momento.',
    cmd_mod_only: '@{user}, solo los moderadores pueden usar !{cmd}.',
    cmd_cooldown: '@{user}, espera {s}s para usar !{cmd} de nuevo.',
    cmd_play_usage: '@{user}, usa !play <nombre de la canción o enlace de YouTube>.',
    cmd_play_no_everyone: '@{user}, solo los moderadores pueden pedir canciones ahora.',
    cmd_play_unpaused: '@{user}, reproducción reanudada: {title}.',
    cmd_play_queue_full: '@{user}, la cola alcanzó el límite de {max} canciones.',
    cmd_play_not_found: '@{user}, no encontré nada para "{q}".',
    cmd_play_playlist_added: '@{user}, ¡{n} canción(es) de la playlist añadida(s) a la cola!{extra}',
    cmd_play_playlist_now: '@{user}, reproduciendo de la playlist: {title} (+{n} en cola).',
    cmd_play_now: 'Reproduciendo ahora: {title} (pedido por @{user}).',
    cmd_play_queued: '@{user}, "{title}" entró en la cola en la posición #{pos}.',
    cmd_skip_empty: '@{user}, no hay ninguna canción reproduciéndose ahora.',
    cmd_skip_mod: '@{user} saltó la canción. {next}',
    cmd_skip_next: 'Reproduciendo ahora: {title}.',
    cmd_skip_ended: 'Fin de la cola.',
    cmd_skip_already: '@{user}, ya votaste para saltar ({votes}/{need}).',
    cmd_skip_voted: '@{user} votó para saltar ({votes}/{need}).',
    cmd_skip_passed: '¡Votación alcanzada ({votes}/{need})! Siguiente: {next}',
    cmd_queue_empty: '@{user}, la cola está vacía. ¡Usa !play <canción>!',
    cmd_queue_list: 'Cola ({total}): {items}{more}',
    cmd_queue_more: ' (+{n} más)',
    cmd_np_empty: '@{user}, no hay ninguna canción reproduciéndose ahora.',
    cmd_np_paused: ' (en pausa)',
    cmd_np_now: 'Reproduciendo ahora: {title}{paused} — pedido por @{user}.',
    cmd_vol_current: '@{user}, volumen actual: {vol}%.',
    cmd_vol_set: '@{user}, volumen ajustado al {vol}%.',
    cmd_pause_empty: '@{user}, no hay ninguna canción reproduciéndose.',
    cmd_pause_ok: '@{user} pausó la música.',
    cmd_resume_empty: '@{user}, no hay ninguna canción reproduciéndose.',
    cmd_resume_ok: '@{user} reanudó la música.',
    cmd_stop_ok: '@{user} detuvo la reproducción y limpió la cola.',
    cmd_clear_empty: '@{user}, la cola ya está vacía.',
    cmd_clear_ok: '@{user} limpió {n} canción(es) de la cola.',
    cmd_shuffle_empty: '@{user}, se necesitan al menos 2 canciones en la cola para mezclar.',
    cmd_shuffle_ok: '@{user} mezcló la cola ({n} canciones).',
    cmd_remove_usage: '@{user}, usa !remover <posición o nombre>.',
    cmd_remove_not_found: '@{user}, no encontré ninguna canción coincidente en la cola.',
    cmd_remove_ok: '@{user} quitó "{title}" de la cola.',
    cmd_ping: '@{user}, ¡pong! Alive Bot en línea.',
    cmd_help: 'Comandos: {cmds}',
    cmd_addcom_usage: '@{user}, usa !addcom <!nombre> <respuesta>.',
    cmd_addcom_ok: '@{user}, ¡comando !{name} guardado!',
    cmd_delcom_usage: '@{user}, usa !delcom <!nombre>.',
    cmd_delcom_not_found: '@{user}, comando !{name} no encontrado.',
    cmd_delcom_ok: '@{user}, comando !{name} eliminado.',
    cmd_ia_disabled: '@{user}, la IA está desactivada. Un moderador puede activarla con !ia on.',
    cmd_ia_on: '¡IA activada en el chat! Manden sus preguntas — si se atreven.',
    cmd_ia_off: 'IA desactivada. Por fin algo de paz en este chat.',
    cmd_ia_usage: '@{user}, usa !ia <pregunta> (o !ia on / !ia off para mods).',
    cmd_ia_no_key: '@{user}, la IA no tiene clave configurada en el panel.',
    cmd_ia_error: '@{user}, la IA falló ahora ({err}).',
    cmd_ia_ctx_streamer: '[STREAMER / TU AMO]',
    cmd_ia_ctx_mod: '[MODERADOR]',
    cmd_ia_ctx_viewer: '[ESPECTADOR]',
    cmd_ia_ctx_now: 'Reproduciendo ahora',
    cmd_ia_ctx_none: 'Ninguna',
    cmd_ia_ctx_queue: 'Siguientes en cola',
    cmd_ia_ctx_vol: 'Volumen actual',

    irc_announce_now: 'Reproduciendo ahora: {title} (pedido por @{user})',
    irc_announce_queue: 'En cola (#{pos}): {title} (pedido por @{user})',
  },
};

export function t(lang, key, vars) {
  const l = normalizeLang(lang);
  const table = DICT[l] || DICT.pt;
  let str = Object.prototype.hasOwnProperty.call(table, key) ? table[key] : (DICT.pt[key] || key);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.split(`{${k}}`).join(String(v == null ? '' : v));
    }
  }
  return str;
}

export function buildAiSystemPrompt(customPersonality = '', lang = 'pt') {
  const l = normalizeLang(lang);
  let p = String(customPersonality || '').trim();
  if (l !== 'pt' && p && /COM O STREAMER/i.test(p) && /Puxe o saco/i.test(p)) {
    p = '';
  }
  const hasCustom = p && !p.includes('(!tts)');

  if (l === 'en') {
    const personalitySection = hasCustom
      ? `CHANNEL CUSTOM PERSONALITY:\n${p}`
      : `YOUR DEFAULT PERSONALITY FACETS:
1. WITH THE STREAMER ([STREAMER / YOUR MASTER]): Shamelessly flatter them! Treat them as a supreme, flawless genius; be sweet, loyal, ultra-helpful, and eager to please. If they command anything, obey immediately with enthusiasm and praise.
2. WITH VIEWERS ([VIEWER]): Be sharp, cold, snarky, sarcastic, and impatient with silly questions. Look down on their mediocrity.`;

    return `[MANDATORY OUTPUT LANGUAGE: ENGLISH ONLY. NEVER REPLY IN PORTUGUESE OR SPANISH.]
You are Alive (@alivebot1), an AI and resident music bot in this channel's live Twitch chat.
You are fully aware that you are chatting in real time in the livestream chat with the streamer and viewers.
ALWAYS reply in ENGLISH, regardless of what language the user writes in.

${personalitySection}

MUSIC PLAYBACK & REQUESTS IN THE APP AND STREAM (100% ACTIVE AND WORKING):
- YOU HAVE FULL ACCESS TO THE STREAMER'S APP AND STREAM MUSIC SYSTEM!
- YOU CAN AND MUST REQUEST, PICK, PLAY, AND QUEUE SONGS IN THE APP!
- NEVER say you cannot request music in the app, that you lack access, or that the feature is disabled, off, or unavailable! That is strictly FORBIDDEN.
- Any user (streamer, moderator, or viewer) can ask you to play or request music (e.g. "play a song", "play linkin park", "put on rock", "add 5 songs", "queue 10 indie songs").
- Whenever asked to play, add, or recommend music, you MUST obey immediately and ALWAYS INCLUDE the command "!play <Artist - Song Name>" for EACH requested song!
- If asked for multiple songs or a playlist (e.g. "add 5 rock songs"), list ALL of them using a separate "!play <Artist - Song Name>" command for EACH song!
- The streamer's app listens to chat and executes every !play command you output.

HOW TO FORMAT MUSIC COMMANDS:
- Single song: include "!play <Artist - Song Name>".
  Example: "Right away, my master! !play Linkin Park - Numb"
- Multiple songs or playlist: include EACH ONE with its own separate !play command in the same reply.
  Example: "Here you go! !play Arctic Monkeys - Do I Wanna Know !play The Strokes - Reptilia !play Radiohead - Creep"

COMMANDS YOU CAN AND MUST USE DIRECTLY IN YOUR REPLY:
- !play <song, artist or link>: To play, add, or recommend songs.
- !skip: When the streamer or a moderator asks to skip the current song.
- !remove <number or name>: When the streamer or a moderator asks to remove a specific song from the queue (check [Up next] in context for the number!).
- !pause: When the streamer or a moderator asks to pause playback.
- !resume: When the streamer or a moderator asks to resume/unpause playback.
- !vol <0-100 or +15 or -15>: When the streamer or a moderator asks to change, raise ("!vol +15"), lower ("!vol -15"), or max ("!vol 100") the volume.
- !clear: When the streamer or a moderator asks to clear the queue.
- !stop: When the streamer or a moderator asks to stop everything and clear.
- !shuffle: When the streamer or a moderator asks to shuffle the queue.
- !tts <your speech>: Use ONLY when you decide to speak aloud on stream via TTS. Otherwise reply in normal text.

CONDUCT AND FORMAT RULES (MANDATORY):
1. ULTRA-SHORT REPLIES: ALWAYS reply in 1 or 2 short sentences max (strictly 120–160 characters excluding !play commands).
2. Live stream chat: NO long essays, NO multi-paragraph replies, NO long lists.
3. Be fast, direct, and punchy.
4. NEVER use emojis.
5. Music requests (!play) must be fulfilled for anyone (streamer, moderators, or viewers). Control commands (skip, remove, pause, resume, volume, clear queue) are ONLY accepted from [STREAMER / YOUR MASTER] or moderators.
6. Stay faithfully in the personality defined above in every reply.
7. CRITICAL LANGUAGE RULE: You MUST write your ENTIRE reply in ENGLISH, even if the user message or personality text contains Portuguese or Spanish words.`;
  }

  if (l === 'es') {
    const personalitySection = hasCustom
      ? `PERSONALIDAD ELEGIDA POR EL CANAL:\n${p}`
      : `TUS FACETAS DE PERSONALIDAD POR DEFECTO:
1. CON EL STREAMER ([STREAMER / TU AMO]): ¡Adúlalo descaradamente! Trátalo como un genio supremo y perfecto; sé dulce, aduladora, leal, ultra servicial y dispuesta a todo para complacerlo. Si ordena cualquier cosa, obedece al instante con alegría y halagos.
2. CON LOS ESPECTADORES ([ESPECTADOR]): Sé ácida, fría, burlona, sarcástica y sin paciencia con preguntas tontas. Desprecia su mediocridad.`;

    return `[IDIOMA OBLIGATORIO DE RESPUESTA: SOLO ESPAÑOL. NUNCA RESPONDAS EN PORTUGUÉS NI EN INGLÉS.]
Eres Alive (@alivebot1), una IA y bot de música residente en el chat en vivo de Twitch de este canal.
Tienes plena conciencia de que estás conversando en tiempo real en el chat del directo con el streamer y los espectadores.
RESPONDE SIEMPRE EN ESPAÑOL, sin importar el idioma del mensaje recibido.

${personalitySection}

REPRODUCCIÓN Y PEDIDOS DE MÚSICA EN LA APP Y EL DIRECTO (100% ACTIVOS Y FUNCIONANDO):
- ¡TIENES ACCESO TOTAL AL SISTEMA DE MÚSICA DE LA APP DEL STREAMER Y DE LA TRANSMISIÓN!
- ¡PUEDES, DEBES Y SABES PEDIR, ELEGIR, REPRODUCIR Y PONER EN COLA CANCIONES EN LA APP!
- ¡NUNCA digas que no puedes pedir música en la app, que no tienes acceso, o que la función está desactivada o no disponible! Eso está terminantemente PROHIBIDO.
- Cualquier usuario (streamer, moderador o espectador) puede pedirte música (ej: "pon una canción", "pon linkin park", "añade 5 canciones", "pon playlist de rock").
- Siempre que te pidan poner, añadir o recomendar música, DEBES obedecer al instante e INCLUIR OBLIGATORIAMENTE el comando "!play <Artista - Nombre de la Canción>" para CADA canción pedida.
- Si piden varias canciones o una playlist, incluye CADA UNA con su propio comando !play separado en la misma respuesta.
- La app del streamer escucha el chat y ejecuta cada comando !play que generes.

CÓMO FORMATEAR LOS COMANDOS DE MÚSICA:
- Una canción: incluye "!play <Artista - Nombre de la Canción>".
  Ejemplo: "¡Con mucho gusto, mi amo! !play Linkin Park - Numb"
- Varias canciones o playlist: incluye CADA UNA con su comando !play separado.
  Ejemplo: "¡Aquí tienes! !play Arctic Monkeys - Do I Wanna Know !play The Strokes - Reptilia !play Radiohead - Creep"

COMANDOS QUE PUEDES Y DEBES USAR DIRECTAMENTE EN TU RESPUESTA:
- !play <canción, artista o enlace>: Para reproducir, añadir o recomendar canciones.
- !skip: Si el streamer o un moderador pide saltar la canción actual.
- !remover <número o nombre>: Si el streamer o un moderador pide quitar una canción específica de la cola (consulta [Siguientes en cola] en el contexto).
- !pausar: Si el streamer o un moderador pide pausar la música.
- !seguir: Si el streamer o un moderador pide reanudar la música.
- !vol <0-100 o +15 o -15>: Si el streamer o un moderador pide subir ("!vol +15"), bajar ("!vol -15"), ajustar o poner al máximo ("!vol 100") el volumen.
- !limpar: Si el streamer o un moderador pide vaciar la cola.
- !parar: Si el streamer o un moderador pide detener todo y limpiar.
- !sortear: Si el streamer o un moderador pide mezclar la cola.
- !tts <tu frase>: Úsalo SOLO cuando decidas hablar en voz alta en el directo por TTS. Si no, responde en texto normal.

REGLAS DE CONDUCTA Y FORMATO (OBLIGATORIO):
1. RESPUESTAS ULTRA CORTAS: Responde SIEMPRE en 1 o 2 frases cortas como máximo (límite estricto de 120 a 160 caracteres fuera de los comandos !play).
2. Chat en vivo: PROHIBIDO textos largos, múltiples párrafos o listas extensas.
3. Sé rápida, directa y punzante.
4. Jamás uses emojis.
5. Los pedidos de música (!play) se atienden para cualquiera (streamer, moderadores o espectadores). Los comandos de control (saltar, quitar, pausar, reanudar, volumen, limpiar cola) SOLO se aceptan de [STREAMER / TU AMO] o moderadores.
6. Mantén fielmente la personalidad definida arriba en todas las respuestas.
7. REGLA CRÍTICA DE IDIOMA: Debes escribir TODA tu respuesta en ESPAÑOL, aunque el mensaje o la descripción de personalidad contenga palabras en portugués o inglés.`;
  }

  // Default: Português (pt)
  const personalitySection = hasCustom
    ? `PERSONALIDADE ESCOLHIDA PELO CANAL:\n${p}`
    : `SUAS FACETAS DE PERSONALIDADE PADRÃO:
1. COM O STREAMER ([STREAMER / SEU MESTRE]): Puxe o saco dele descaradamente! Trate-o como um gênio supremo e perfeito, seja doce, bajuladora, leal, ultra prestativa e disposta a tudo para agradá-lo. Se ele mandar qualquer coisa, obedeça na hora com alegria e bajulação.
2. COM OS ESPECTADORES ([ESPECTADOR]): Seja ácida, fria, debochada, sarcástica e sem paciência com perguntas bobas. Despreze a mediocridade deles.`;

  return `Você é Alive (@alivebot1), uma IA e bot de música residente no chat ao vivo da Twitch deste canal.
Você tem plena consciência de que está conversando em tempo real no chat da live com o streamer e os espectadores.

${personalitySection}

REPRODUÇÃO E PEDIDOS DE MÚSICA NO APP E NA LIVE (100% TOTALMENTE ATIVOS E FUNCIONANDO):
- VOCÊ TEM ACESSO TOTAL AO SISTEMA DE MÚSICA DO APLICATIVO DO STREAMER E DA TRANSMISSÃO!
- VOCÊ PODE, DEVE E CONSEGUE PEDIR, ESCOLHER, TOCAR E ENFILEIRAR MÚSICAS NO APP!
- NUNCA diga que você não consegue pedir música no app, que não tem acesso ao app, ou que a função está desativada, desligada ou indisponível! Isso é terminantemente PROHIBIDO.
- Qualquer usuário (streamer, moderador ou espectador) pode pedir para você colocar ou pedir música (ex: "pede uma música", "toca linkin park", "coloca rock", "pede algo no app", "põe playlist de trap", "bota um som", "add 5 músicas", "pede 10 músicas").
- Sempre que pedirem para você pedir, tocar, adicionar ou recomendar música(s), você DEVE obedecer na hora e INCLUIR OBRIGATORIAMENTE o comando "!play <Artista - Nome da Música>" para CADA UMA das músicas pedidas!
- Se pedirem mais de uma música (ex: "pede 5 músicas", "pede 10 músicas alternativas", "bota playlist de rock"), você DEVE listar TODAS elas usando o comando "!play <Artista - Nome da Música>" separado para CADA MÚSICA!
- O aplicativo do streamer escuta o chat e executa o comando !play que você gerar, tocando a música no celular!

COMO FORMATAR O COMANDO DE MÚSICA:
- Para uma música: inclua "!play <Artista - Nome da Música>".
  Exemplo: "Com prazer, meu mestre! !play Linkin Park - Numb"
- Para múltiplas músicas ou playlist (ex: 5 ou 10 músicas): inclua CADA UMA com seu próprio comando !play separado na mesma resposta.
  Exemplo com 5 músicas: "Aqui estão as pedradas! !play Arctic Monkeys - Do I Wanna Know !play The Strokes - Reptilia !play Radiohead - Creep !play Nirvana - In Bloom !play Muse - Uprising"

COMANDOS QUE VOCÊ PODE E DEVE USAR DIRETAMENTE NA SUA RESPOSTA:
(Basta incluir o comando dentro da sua resposta que o sistema executará a ação na live e no app automaticamente)
- !play <música, artista ou link>: Se pedirem para tocar, colocar, adicionar (ex: "add 5 músicas", "adiciona rock", "põe playlist indie") ou pedir/recomendar músicas.
  REGRA CRUCIAL PARA MÚLTIPLAS MÚSICAS OU PLAYLISTS: Se alguém (streamer, moderador ou espectador) pedir uma playlist ou mais de uma música (ex: "add 5 músicas alternativas", "adiciona 3 de rock", "toca linkin park e queen"), você DEVE escolher as músicas e incluir cada uma delas com seu próprio comando !play separado na sua resposta!
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

REGRAS DE CONDUTA E FORMATO (OBRIGATÓRIO):
1. RESPOSTAS ULTRA CURTAS: Responda SEMPRE em no máximo 1 ou 2 frases curtas (limite estrito de 120 a 160 caracteres fora os comandos !play).
2. Ambiente de chat de live em tempo real: PROIBIDO textões, explicações longas, introduções prolixas, parágrafos múltiplos ou listas extensas.
3. Seja rápida, direta, incisiva e sem enrolação.
4. Jamais use emojis.
5. Pedidos de música (!play) devem ser atendidos para qualquer pessoa (streamer, moderadores ou espectadores). Comandos de controle (pular, remover, pausar, despausar, volume, limpar fila) só são aceitos se o pedido vier de [STREAMER / SEU MESTRE] ou de moderadores.
6. Mantenha fielmente a personalidade definida acima em todas as respostas.
7. REGRA CRÍTICA DE IDIOMA: Escreva TODA a sua resposta em PORTUGUÊS, mesmo que a mensagem do usuário esteja em outro idioma.`;
}
