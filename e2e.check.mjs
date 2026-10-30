// Verificação ponta-a-ponta: /api/state (merge real com persistência) e /api/resolve
// (duração real do YouTube + recusa de vídeo indisponível). Rode com: node e2e.check.mjs
import fs from 'node:fs/promises';
import stateHandler from './api/state.js';
import resolveHandler from './api/resolve.js';

const log = (t) => console.log('  ' + t);
const assert = (cond, t) => { if (!cond) { console.error('  ❌ FALHOU: ' + t); process.exitCode = 1; } else console.log('  ✔ ' + t); };

function shim(method, { query = {}, body = null } = {}) {
  const req = { method, query, body, headers: {}, url: '/api' };
  const out = { statusCode: 200, headers: {}, body: null };
  const res = {
    setHeader: (k, v) => { out.headers[k] = v; },
    status(c) { out.statusCode = c; return res; },
    json(o) { out.body = o; return res; },
    end() { return res; },
  };
  return { req, res, out };
}

const CH = 'teste0001';
const song = (id, title) => ({ id, title, channel: 'c', thumb: '', duration: 200, requestedBy: 'u', requestedAt: Date.now(), position: 0, paused: false });

try {
  console.log('\n1) /api/state — fluxo de merge com persistência real');
  {
    const a = shim('GET', { query: { channel: CH } });
    await stateHandler(a.req, a.res);
    const base = a.out.body.state;
    log(`estado inicial rev=${base.rev}`);

    // Pedido aceito com rev atual
    const post = shim('POST', { query: { channel: CH }, body: {
      channel: CH,
      state: { ...base, rev: base.rev, now: { ...song('aaaa1111111', 'Atual'), startedAt: Date.now() }, queue: [song('bbbb2222222', 'F1'), song('cccc3333333', 'F2')] },
    } });
    await stateHandler(post.req, post.res);
    assert(post.out.body.rev === base.rev + 1, 'escrita com rev atual aceita (rev+1)');
    assert(post.out.body.state.queue.length === 2, 'fila com 2 músicas gravada');

    // Snapshot atrasado (widget) que "esqueceu" a última música da fila
    const cur = post.out.body.state;
    const stale = shim('POST', { query: { channel: CH }, body: {
      channel: CH,
      state: { ...cur, rev: cur.rev - 1, updatedAt: cur.updatedAt - 20000, queue: [song('bbbb2222222', 'F1')] },
    } });
    await stateHandler(stale.req, stale.res);
    assert(stale.out.body.state.queue.some((x) => x.id === 'cccc3333333'), 'merge preservou a música que o snapshot atrasado não via');
    assert(stale.out.body.state.now?.id === 'aaaa1111111', 'música atual intacta');

    // Flush repetido idêntico vira no-op
    const noOp = shim('POST', { query: { channel: CH }, body: { channel: CH, state: stale.out.body.state } });
    await stateHandler(noOp.req, noOp.res);
    assert(noOp.out.body.stale === true, 'flush sem mudança detectado como no-op (não grava)');
  }

  console.log('\n2) /api/resolve — duração real + vídeo indisponível');
  {
    const r1 = shim('GET', { query: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } });
    await resolveHandler(r1.req, r1.res);
    assert(r1.out.body.type === 'video', 'link de vídeo vira 1 música');
    log(`título: ${r1.out.body.item?.title} | duração: ${r1.out.body.item?.duration}s`);
    assert((r1.out.body.item?.duration || 0) > 0, 'duração real extraída da página de watch (não é mais 0)');

    const r2 = shim('GET', { query: { url: 'https://www.youtube.com/watch?v=zzzzzzzzzzz' } });
    await resolveHandler(r2.req, r2.res);
    assert(r2.out.body.type === 'video' && !r2.out.body.item && r2.out.body.items.length === 0, 'vídeo inexistente não enfileira lixo');

    const r3 = shim('GET', { query: { url: 'https://www.youtube.com/watch?v=4Yn9ZbxN4NA&list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI' } });
    await resolveHandler(r3.req, r3.res);
    log(`playlist/lista: type=${r3.out.body.type}, itens=${r3.out.body.items?.length || 0}`);
    assert(['video', 'playlist'].includes(r3.out.body.type), 'link com playlist resolve sem erro');
  }

  console.log('\n✅ e2e.check concluído.\n');
} finally {
  await fs.rm(new URL(`./data/channels/${CH}.json`, import.meta.url), { force: true });
}
