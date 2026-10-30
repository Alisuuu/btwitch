// Teste do merge de estado no sync (/api/state) — protege a fila de músicas contra
// "lost updates" (snapshot atrasado apagando pedido recém-feito).
import { defaultState, sanitize } from './js/state.js';
import { mergeStates } from './api/state.js';

const log = (t) => console.log('  ' + t);
const assert = (cond, t) => { if (!cond) { console.error('  ❌ FALHOU: ' + t); process.exitCode = 1; } else console.log('  ✔ ' + t); };

const song = (id, title) => ({ id, title, channel: 'c', thumb: '', duration: 200, requestedBy: 'u', requestedAt: Date.now(), position: 0, paused: false });

// Estado do servidor (mais novo, rev 10) com 1 música na fila.
function servidor() {
  const s = defaultState();
  s.rev = 10;
  s.updatedAt = Date.now() - 2000;
  s.now = { ...song('aaaa1111111', 'Atual'), startedAt: Date.now() - 60000 };
  s.queue = [song('bbbb2222222', 'Fila 1'), song('cccc3333333', 'Fila 2')];
  s.config.channel = 'canal';
  return sanitize(s);
}

console.log('\n1) snapshot atrasado com fila MENOR não apaga pedidos do servidor');
{
  const current = servidor();
  const stale = JSON.parse(JSON.stringify(current));
  stale.rev = 9;                 // widget com 1 pull de atraso
  stale.queue = [song('bbbb2222222', 'Fila 1')]; // perdeu o "cccc" no snapshot
  const out = mergeStates(current, sanitize(stale));
  assert(out.queue.some((x) => x.id === 'cccc3333333'), 'música "cccc" preservada na fila');
  assert(out.now?.id === 'aaaa1111111', 'música atual preservada');
}

console.log('\n2) pedido novo em snapshot atrasado é somado (união da fila)');
{
  const current = servidor();
  const stale = JSON.parse(JSON.stringify(current));
  stale.rev = 9;
  stale.queue = [song('bbbb2222222', 'Fila 1'), song('dddd4444444', 'Pedido novo')];
  const out = mergeStates(current, sanitize(stale));
  assert(out.queue.some((x) => x.id === 'cccc3333333'), 'item do servidor mantido');
  assert(out.queue.some((x) => x.id === 'dddd4444444'), 'pedido novo adicionado');
  assert(out.queue.filter((x) => x.id === 'bbbb2222222').length === 1, 'sem duplicar a música que já existia');
}

console.log('\n3) fim de vídeo no widget (rev atrasado) avança de verdade');
{
  const current = servidor();
  const stale = JSON.parse(JSON.stringify(current));
  stale.rev = 9;
  stale.now = { ...stale.queue[0], startedAt: Date.now() }; // widget avançou localmente
  stale.queue = [song('cccc3333333', 'Fila 2')];
  const out = mergeStates(current, sanitize(stale));
  assert(out.now?.id === 'bbbb2222222', 'avançou para a próxima da fila');
  assert(out.queue.length === 1 && out.queue[0].id === 'cccc3333333', 'fila deslocou corretamente');
  assert(out.history[0]?.id === 'aaaa1111111', 'anterior foi pro histórico');
  assert((out.stats.played || 0) === 1, 'estatística de tocadas incrementada');
}

console.log('\n4) escrita com rev atual é aceita integralmente');
{
  const current = servidor();
  const incoming = JSON.parse(JSON.stringify(current));
  incoming.rev = 10;
  incoming.queue = []; // !limpar legítimo feito com estado atualizado
  const out = mergeStates(current, sanitize(incoming));
  assert(out.queue.length === 0, 'fila limpa pelo comando legítimo');
  assert(out.rev === 11, 'rev avançou para 11');
}

console.log('\n5) config antiga não sobrescreve a do servidor; config mais nova é aceita');
{
  const current = servidor();
  current.config.maxQueue = 80;

  const stale = JSON.parse(JSON.stringify(current));
  stale.rev = 9;
  stale.updatedAt = current.updatedAt - 60000;
  stale.config.maxQueue = 10;
  assert(mergeStates(current, sanitize(stale)).config.maxQueue === 80, 'config antiga descartada');

  const fresco = JSON.parse(JSON.stringify(current));
  fresco.rev = 10;
  fresco.updatedAt = current.updatedAt + 5000;
  fresco.config.maxQueue = 25;
  assert(mergeStates(current, sanitize(fresco)).config.maxQueue === 25, 'config mais nova aplicada');
}

console.log('\n6) votos de skip são unidos');
{
  const current = servidor();
  current.skip = { id: 'aaaa1111111', votes: ['u1'] };
  const stale = JSON.parse(JSON.stringify(current));
  stale.rev = 9;
  stale.skip = { id: 'aaaa1111111', votes: ['u2', 'u3'] };
  const out = mergeStates(current, sanitize(stale));
  assert(out.skip?.votes.length === 3, 'votos unidos (u1, u2, u3)');
}

console.log('\n7) write atrasado sem mudança real não gera estado novo (flush vira no-op)');
{
  const current = servidor();
  const stale = sanitize(JSON.parse(JSON.stringify(current)));
  const out = mergeStates(current, stale);
  const fp = (s) => JSON.stringify({ ...s, rev: 0, updatedAt: 0 });
  assert(fp(out) === fp(current), 'resultado idêntico ao estado do servidor');
}

console.log('\n8) volume atrasado não regride quando o servidor é mais novo');
{
  const current = servidor();
  current.volume = 20; // mod acabou de baixar
  const stale = JSON.parse(JSON.stringify(current));
  stale.rev = 9;
  stale.updatedAt = current.updatedAt - 30000;
  stale.volume = 90;
  assert(mergeStates(current, sanitize(stale)).volume === 20, 'volume do servidor mantido');
}

console.log('\n✅ sync.test concluído.\n');
