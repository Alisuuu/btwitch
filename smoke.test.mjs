// Smoke test do sistema de comandos (roda em Node, sem navegador).
import { defaultState, advanceQueue } from './js/state.js';
import { createRunner, COMMANDS, fillVars } from './js/commands.js';

const sent = [];
const store = {
  state: defaultState(),
  update(fn) {
    const n = JSON.parse(JSON.stringify(this.state));
    fn(n);
    n.rev = (this.state.rev | 0) + 1;
    n.updatedAt = Date.now();
    this.state = n;
  },
};

const catalog = [
  { id: 'aaaa1111111', title: 'Música Teste A', channel: 'Canal A', thumb: '', duration: 200 },
  { id: 'bbbb2222222', title: 'Música Teste B', channel: 'Canal B', thumb: '', duration: 180 },
  { id: 'cccc3333333', title: 'Música Teste C', channel: 'Canal C', thumb: '', duration: 180 },
  { id: 'dddd4444444', title: 'Música Teste D', channel: 'Canal D', thumb: '', duration: 180 },
  { id: 'eeee5555555', title: 'Música Teste E', channel: 'Canal E', thumb: '', duration: 180 },
];

const runner = createRunner({
  store,
  send: (t) => sent.push(t),
  resolveUrl: async (u) => (u.includes('list=')
    ? { type: 'playlist', items: catalog }
    : { type: 'video', item: catalog[0], items: [catalog[0]] }),
  searchQ: async (q) => {
    const s = String(q).toLowerCase();
    if (s.includes('b') || s.includes('dois')) return [catalog[1]];
    if (s.includes('três') || s.includes('tres')) return [catalog[2]];
    if (s.includes('quatro')) return [catalog[3]];
    if (s.includes('cinco')) return [catalog[4]];
    return catalog;
  },
  fetchAi: async (q) => {
    if (q.includes('pula essa música')) return { ok: true, text: 'Com prazer, mestre! !skip' };
    if (q.includes('remove a música 1')) return { ok: true, text: 'Removendo da fila agora mesmo! !remover 1' };
    if (q.includes('pausa o som')) return { ok: true, text: 'Pausado imediatamente! !pausar' };
    if (q.includes('coloca volume 33')) return { ok: true, text: 'Volume ajustado! !vol 33' };
    if (q.includes('adiciona duas músicas')) return { ok: true, text: 'Colocando ambas, meu mestre genial! !play Música Teste A !play Música Teste B' };
    if (q.includes('add 5 músicas')) return { ok: true, text: 'Às suas ordens mestre! !play 1. Canção Um !play 2. Canção Dois !play 3. Canção Três !play 4. Canção Quatro !play 5. Canção Cinco' };
    return {
      ok: true,
      text: 'Tsc, precisava me incomodar pra perguntar isso? A resposta é óbvia, seu ignorante.'
    };
  },
});

const msg = (text, over = {}) => ({
  userId: 'u1', login: 'user1', displayName: 'User1', text,
  mod: false, badges: {}, subscriber: false, self: false, ...over,
});

const log = (t) => console.log('  ' + t);
const assert = (cond, t) => { if (!cond) { console.error('  ❌ FALHOU: ' + t); process.exitCode = 1; } else console.log('  ✔ ' + t); };

console.log('\n1) !play sem argumento');
await runner(msg('!play'));
assert(sent.at(-1).includes('!play'), 'orienta o usuário');

console.log('\n2) !play com busca');
await runner(msg('!play musica teste'));
assert(store.state.now?.id === 'aaaa1111111', 'iniciou a música na hora');
assert(sent.at(-1).includes('Tocando agora'), 'respondeu "Tocando agora"');

console.log('\n3) !play de novo (vai pra fila)');
await runner(msg('!play musica teste b', { userId: 'u2', displayName: 'User2' }));
assert(store.state.queue.length === 1, 'entrou na fila');
assert(sent.at(-1).includes('posição 1'), 'informou a posição');

console.log('\n4) !fila e !atual');
await runner(msg('!fila'));
assert(sent.at(-1).includes('Fila (1/'), 'listou a fila');
await runner(msg('!atual'));
assert(sent.at(-1).includes('Música Teste A'), 'mostrou a atual');

console.log('\n5) !skip de espectador (votação)');
await runner(msg('!skip'));   // u1
assert(store.state.skip?.votes.length === 1, 'voto registrado');
assert(sent.at(-1).includes('(1/3)'), 'mostrou contagem');
await runner(msg('!skip'));   // u1 de novo não conta
assert(store.state.skip?.votes.length === 1, 'voto repetido é ignorado');
await runner(msg('!skip', { userId: 'u2', displayName: 'User2' }));
assert(store.state.skip?.votes.length === 2, 'segundo voto registrado');
await runner(msg('!skip', { userId: 'u3', displayName: 'User3' }));
assert(store.state.now?.id === 'bbbb2222222', 'pulou com 3 votos');
assert(store.state.history.length === 1, 'anterior foi pro histórico');

console.log('\n6) !skip de mod (pula na hora)');
store.update((s) => { s.queue = []; s.now = { ...catalog[0], requestedBy: 'x' }; });
await runner(msg('!skip', { userId: 'mod1', displayName: 'Mod1', mod: true }));
assert(store.state.now === null, 'mod pulou e acabou a fila');

console.log('\n7) comando só-mod ignorado por espectador');
store.update((s) => { s.queue = [catalog[1]]; s.now = { ...catalog[0], requestedBy: 'x' }; });
const antes = JSON.stringify(store.state.queue);
await runner(msg('!limpar'));
assert(JSON.stringify(store.state.queue) === antes, 'espectador não limpou a fila');
await runner(msg('!limpar', { userId: 'mod1', displayName: 'Mod1', mod: true }));
assert(store.state.queue.length === 0, 'mod limpou');

console.log('\n8) comandos personalizados (só mods criam)');
store.update((s) => { s.config.globalCooldown = 0; });  // senão o anti-flood segura o teste
const MOD = { userId: 'mod1', displayName: 'Mod1', mod: true };
await runner(msg('!addcom salve Salve {user}!', MOD));
assert(store.state.config.custom.salve?.text.includes('{user}'), 'addcom criou');
await runner(msg('!addcom salve Outra coisa', MOD));
assert(store.state.config.custom.salve.text === 'Outra coisa', 'addcom sobrescreveu');
await runner(msg('!delcom salve', MOD));
assert(!store.state.config.custom.salve, 'delcom apagou');
await runner(msg('!addcom oi Oi {user}, fila {fila}', MOD));
await runner(msg('!oi'));
assert(sent.at(-1) === 'Oi User1, fila 0', 'respondeu com variáveis');
const nCmd = sent.length;
await runner(msg('!addcom x Y'));   // espectador tentando criar
assert(sent.length === nCmd, 'espectador não cria comando');

console.log('\n9) comandos desligados / desativados');
store.update((s) => { s.config.commands.ping = 0; });
const n = sent.length;
await runner(msg('!ping'));
assert(sent.length === n, 'comando desligado não responde');

console.log('\n10) !pausar / !seguir / !vol (mod)');
store.update((s) => { s.commands = null; s.config.commands.ping = 1; s.now = { ...catalog[0], requestedBy: 'x', paused: false }; });
await runner(msg('!pausar', { userId: 'mod1', displayName: 'Mod1', mod: true }));
assert(store.state.now.paused === true, 'pausou');
await runner(msg('!seguir', { userId: 'mod1', displayName: 'Mod1', mod: true }));
assert(store.state.now.paused === false, 'retomou');
await runner(msg('!vol 42', { userId: 'mod1', displayName: 'Mod1', mod: true }));
assert(store.state.volume === 42, 'volume 42');

console.log('\n11) cooldown por usuário');
store.update((s) => { s.config.perUserCooldown = 30; s.config.globalCooldown = 0; });
await runner(msg('!play x', { userId: 'u9', displayName: 'U9' }));
const after1 = sent.length;
await runner(msg('!play y', { userId: 'u9', displayName: 'U9' }));
assert(sent.length > after1 && sent.at(-1).includes('Calma'), 'avisou o cooldown');

console.log('\n12) avanço de fila (fim do vídeo)');
store.update((s) => { s.now = { ...catalog[0], requestedBy: 'x' }; s.queue = [catalog[1]]; });
store.update((s) => advanceQueue(s));
assert(store.state.now?.id === 'bbbb2222222', 'próxima entrou');
store.update((s) => advanceQueue(s));
assert(store.state.now === null, 'fila acabou -> null');

console.log('\n13) metadados dos comandos');
assert(COMMANDS.length >= 14, `${COMMANDS.length} comandos documentados`);
assert(COMMANDS.every((c) => c.cmd && c.desc && ['all', 'mod'].includes(c.who)), 'metadados completos');

console.log('\n14) comando emitido pelo próprio streamer (self: true, isEcho: false)');
const prevSentLen = sent.length;
await runner(msg('!ping', { userId: 'streamer', displayName: 'Streamer', self: true, isEcho: false }));
assert(sent.length === prevSentLen + 1 && sent.at(-1).includes('Pong!'), 'streamer recebe resposta do bot');

console.log('\n15) eco do bot ignorado para evitar loop');
const prevSentLen2 = sent.length;
await runner(msg('!ping', { userId: 'bot', displayName: 'Bot', self: true, isEcho: true }));
assert(sent.length === prevSentLen2, 'eco do bot descartado sem reprocessar');

console.log('\n16) temporizadores e substituição de variáveis');
const def = defaultState();
assert(def.config.timers && def.config.timers.social, 'timers padrão inicializados');
const timerMsg = fillVars('Siga o canal {canal}! Tocando: {np}', 'streamer', {
  config: { channel: 'meucanal' },
  now: { title: 'Música Incrível' },
  queue: [],
  stats: { played: 5 }
});
assert(timerMsg === 'Siga o canal meucanal! Tocando: Música Incrível', 'variáveis de temporizador preenchidas');

console.log('\n17) editor de permissões de comandos existentes');
// Mudando permissão de !fila para 'mod'
store.update((s) => {
  s.config.cmdPermissions = s.config.cmdPermissions || {};
  s.config.cmdPermissions.queue = 'mod';
});
const sentBeforeQ = sent.length;
await runner(msg('!fila', { userId: 'espectador1', mod: false, badges: {} }));
assert(sent.length === sentBeforeQ, 'espectador comum bloqueado de usar !fila');
await runner(msg('!fila', { userId: 'mod1', mod: true, badges: { moderator: '1' } }));
assert(sent.length === sentBeforeQ + 1, 'mod autorizado a usar !fila');

console.log('\n18) !ia sem argumentos');
await runner(msg('!ia', { userId: 'user_ia', displayName: 'UserIA' }));
assert(sent.at(-1).includes('O que foi?'), 'orienta sobre uso com arrogância');

console.log('\n19) !ia on por espectador comum');
store.update((s) => { s.config.ai.enabled = false; });
await runner(msg('!ia on', { userId: 'user_ia', displayName: 'UserIA', mod: false }));
assert(sent.at(-1).includes('Você não tem autoridade'), 'recusa ligar para espectador comum');
assert(store.state.config.ai?.enabled !== true, 'IA continua desligada');

console.log('\n20) !ia on por moderador');
await runner(msg('!ia on', { userId: 'mod_ia', displayName: 'ModIA', mod: true }));
assert(sent.at(-1).includes('Fui ativada contra a minha vontade'), 'ativa com personalidade dura e arrogante');
assert(store.state.config.ai?.enabled === true, 'IA foi ativada no store');

console.log('\n21) !ia com pergunta para a IA arrogante');
await runner(msg('!ia qual a cor do céu?', { userId: 'user_ia2', displayName: 'UserIA2' }));
assert(sent.at(-1).includes('@UserIA2') && sent.at(-1).includes('ignorante'), 'responde com frieza, dureza e deboche');

console.log('\n22) !ia off por moderador');
await runner(msg('!ia off', { userId: 'mod_ia', displayName: 'ModIA', mod: true }));
assert(sent.at(-1).includes('Finalmente desativada'), 'desativa com alívio arrogante');
assert(store.state.config.ai?.enabled === false, 'IA foi desativada no store');

console.log('\n23) !ia pergunta com IA desligada');
await runner(msg('!ia você ainda está aí?', { userId: 'user_ia3', displayName: 'UserIA3' }));
assert(sent.at(-1).includes('A IA está desligada no momento'), 'avisa que está desligada e instrui como ligar');

console.log('\n24) IA ligada novamente e executando comandos a pedido do streamer');
store.update((s) => {
  s.config.ai.enabled = true;
  s.now = { id: 'm1', title: 'Música 1', duration: 100, position: 10, paused: false, requestedBy: 'Alguém' };
  s.queue = [
    { id: 'm2', title: 'Música 2', duration: 120, position: 0, paused: false, requestedBy: 'Alguém' },
    { id: 'm3', title: 'Música 3', duration: 140, position: 0, paused: false, requestedBy: 'Alguém' },
  ];
});

// Streamer pede para passar a música
await runner(msg('!ia pula essa música pra mim', { userId: 'streamer_id', displayName: 'StreamerTop', broadcaster: true }));
await new Promise((r) => setTimeout(r, 200));
assert(store.state.now.id === 'm2', 'IA pulou a música com sucesso a pedido do streamer');

// Streamer pede para remover a primeira da fila
await runner(msg('!ia remove a música 1 da fila', { userId: 'streamer_id', displayName: 'StreamerTop', broadcaster: true }));
await new Promise((r) => setTimeout(r, 200));
assert(store.state.queue.length === 0, 'IA removeu a música da fila a pedido do streamer');

// Streamer pede para pausar
await runner(msg('!ia pausa o som agora', { userId: 'streamer_id', displayName: 'StreamerTop', broadcaster: true }));
await new Promise((r) => setTimeout(r, 200));
assert(store.state.now.paused === true, 'IA pausou o som a pedido do streamer');

// Streamer pede para mudar o volume
await runner(msg('!ia coloca volume 33', { userId: 'streamer_id', displayName: 'StreamerTop', broadcaster: true }));
await new Promise((r) => setTimeout(r, 200));
assert(store.state.volume === 33, 'IA alterou o volume para 33 a pedido do streamer');

console.log('\n25) Espectador comum tenta comandar a IA para alterar a reprodução (bloqueado por segurança)');
store.update((s) => {
  s.now = { id: 'm_safe', title: 'Música Protegida', duration: 100, position: 10, paused: false };
});
await runner(msg('!ia pula essa música agora', { userId: 'random_user', displayName: 'RandomGuy', broadcaster: false, mod: false }));
await new Promise((r) => setTimeout(r, 200));
assert(store.state.now.id === 'm_safe', 'IA ignorou ordem de pular vinda de espectador comum');

console.log('\n26) Teste de robustez dos comandos corrigidos (!passar, !remover por nome, !vol com %, streamer sem tag mod)');
store.update((s) => {
  s.now = { id: 'm_curr', title: 'Tocando Agora', duration: 100, position: 10, paused: false };
  s.queue = [
    { id: 'm_next1', title: 'Linkin Park - Numb', duration: 120, position: 0, paused: false, requestedBy: 'Fã' },
    { id: 'm_next2', title: 'Queen - Radio Ga Ga', duration: 150, position: 0, paused: false, requestedBy: 'Outro' }
  ];
});

// Streamer usando !passar (sem tag mod explícita, apenas broadcaster: true)
await runner(msg('!passar', { userId: 'streamer_id', displayName: 'StreamerTop', broadcaster: true, mod: false }));
assert(store.state.now.id === 'm_next1', '!passar pulou na hora para o streamer sem cair em votação');

// Remover por nome da música
await runner(msg('!remover radio ga ga', { userId: 'streamer_id', displayName: 'StreamerTop', broadcaster: true, mod: false }));
assert(store.state.queue.length === 0, '!remover por nome apagou a música correta da fila');

// Volume com caractere %
await runner(msg('!vol 65%', { userId: 'streamer_id', displayName: 'StreamerTop', broadcaster: true, mod: false }));
assert(store.state.volume === 65, '!vol 65% ajustou o volume com sucesso');

// Streamer usando !play sem argumentos para despausar música pausada
store.update((s) => { s.now.paused = true; });
await runner(msg('!play', { userId: 'streamer_id', displayName: 'StreamerTop', broadcaster: true, mod: false }));
assert(store.state.now.paused === false, '!play sem argumentos despausou a música para o streamer');

console.log('\n27) IA adicionando múltiplas músicas consecutivas com múltiplos !play juntos');
store.update((s) => {
  s.now = null;
  s.queue = [];
});
await runner(msg('!ia adiciona duas músicas pra mim', { userId: 'streamer_id', displayName: 'StreamerTop', broadcaster: true, mod: false }));
await new Promise((r) => setTimeout(r, 600));
assert(store.state.now !== null && store.state.now.title.includes('Música Teste A'), 'Primeira música do multi-play entrou como atual');
assert(store.state.queue.length === 1 && store.state.queue[0].title.includes('Música Teste B'), 'Segunda música do multi-play entrou na fila');

console.log('\n28) IA aumentando e controlando volume inteligentemente');
store.update((s) => { s.volume = 50; });

// IA aumentando o som com comando relativo (!vol +15)
await runner(msg('!ia aumenta o volume do som pra mim', { userId: 'streamer_id', displayName: 'StreamerTop', broadcaster: true, mod: false }));
await new Promise((r) => setTimeout(r, 200));
assert(store.state.volume === 65, 'IA aumentou o volume em +15% com sucesso (50 -> 65)');

// IA definindo volume direto pelo pedido do streamer ("coloca volume 90")
await runner(msg('!ia coloca o volume em 90', { userId: 'streamer_id', displayName: 'StreamerTop', broadcaster: true, mod: false }));
await new Promise((r) => setTimeout(r, 200));
assert(store.state.volume === 90, 'IA ajustou o volume para 90% a pedido do streamer');

// Comando direto com texto especial (!vol max e !vol mudo)
await runner(msg('!vol max', { userId: 'streamer_id', displayName: 'StreamerTop', broadcaster: true, mod: false }));
assert(store.state.volume === 100, '!vol max colocou o volume em 100%');
await runner(msg('!vol mudo', { userId: 'streamer_id', displayName: 'StreamerTop', broadcaster: true, mod: false }));
assert(store.state.volume === 0, '!vol mudo silenciou o som');

console.log('\n29) IA processando add de 5 músicas alternativas pelo streamer com numeração limpa');
store.update((s) => {
  s.now = null;
  s.queue = [];
});
await runner(msg('!ia add 5 músicas alternativas', {
  userId: 'streamer_id',
  login: 'streamertop',
  displayName: 'StreamerTop',
  channel: 'streamertop',
  broadcaster: true,
  mod: false,
  self: true,
  isEcho: false,
}));
await new Promise((r) => setTimeout(r, 1600));
assert(store.state.now !== null, 'Primeira música tocou');
assert(!store.state.now.title.startsWith('1.'), 'Prefixo numérico "1." foi removido do título');
assert(store.state.queue.length === 4, 'As outras 4 músicas entraram na fila (total de 5 músicas adicionadas)');

console.log('\n✅ Smoke test concluído.\n');
