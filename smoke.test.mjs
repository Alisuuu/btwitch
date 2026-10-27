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
];

const runner = createRunner({
  store,
  send: (t) => sent.push(t),
  resolveUrl: async (u) => (u.includes('list=')
    ? { type: 'playlist', items: catalog }
    : { type: 'video', item: catalog[0], items: [catalog[0]] }),
  searchQ: async (q) => (String(q).toLowerCase().includes('b') ? [catalog[1]] : catalog),
  fetchAi: async (q) => {
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

console.log('\n✅ Smoke test concluído.\n');
