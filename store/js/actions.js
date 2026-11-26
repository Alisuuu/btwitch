/* ==========================================================================
   ALIVE STORE — ações de compra e download
   Compra in-app (Google Play Billing via WebView) + fallback fora do app.
   ========================================================================== */
(function () {
  'use strict';

  var U = window.ALIVE_UI;
  var CFG = window.ALIVE_CONFIG;

  /* ---------------- Modal de fallback (fora do app) ---------------- */
  var fbModal = null;

  function ensureFallbackModal() {
    if (fbModal) return fbModal;
    var wrap = document.createElement('div');
    wrap.className = 'modal';
    wrap.id = 'fallbackModal';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-labelledby', 'fbTitle');
    wrap.innerHTML =
      '<div class="modal-backdrop" data-close></div>' +
      '<div class="modal-panel" style="width:min(460px,calc(100% - 28px))">' +
        '<button class="btn-icon modal-close" data-close aria-label="Fechar">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
        '</button>' +
        '<div class="modal-content" style="padding:30px 26px 28px;text-align:center">' +
          '<div style="width:56px;height:56px;border-radius:16px;background:#ffffff;color:#000000;display:grid;place-items:center;font-size:26px;margin:0 auto 6px">▶</div>' +
          '<h3 id="fbTitle" class="display" style="margin:6px 0 4px;font-size:20px">Compre dentro do app Alive</h3>' +
          '<p class="muted" id="fbText" style="margin:0 0 4px;font-size:14px"></p>' +
          '<div class="tag-row" id="fbTags" style="justify-content:center;margin:10px 0 18px"></div>' +
          '<div style="display:flex;flex-direction:column;gap:10px">' +
            '<button class="btn btn-primary btn-block btn-lg" id="fbStore">Abrir na Google Play</button>' +
            '<button class="btn btn-block" id="fbWhats">Falar no suporte</button>' +
          '</div>' +
          '<p class="note" style="margin-top:14px">As compras são processadas pela Google Play dentro do app. Nenhum dado de cartão passa pela loja web.</p>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);
    fbModal = wrap;

    wrap.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) closeFallback();
    });
    document.getElementById('fbStore').addEventListener('click', function () {
      window.AliveBridge.openExternal(CFG.playStoreUrl);
    });
    document.getElementById('fbWhats').addEventListener('click', function () {
      window.AliveBridge.openExternal('https://wa.me/' + CFG.supportWhats + '?text=' +
        encodeURIComponent('Oi! Preciso de ajuda na loja de overlays da Alive.'));
    });
    return wrap;
  }

  function openFallback(p) {
    var m = ensureFallbackModal();
    document.getElementById('fbText').textContent = window.AliveBridge.isNative()
      ? 'Não foi possível iniciar a compra agora.'
      : 'Você está vendo a loja no navegador. Abra o app Alive para pagar com Google Play e receber o overlay automaticamente.';
    document.getElementById('fbTags').innerHTML = p
      ? '<span class="tag">' + U.esc(p.name) + '</span><span class="tag">' + U.brl(p.price) + '</span>'
      : '';
    m.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeFallback() {
    if (fbModal) fbModal.classList.remove('open');
    if (!document.querySelector('.modal.open')) document.body.style.overflow = '';
  }

  /* ---------------- Compra ----------------
     Sempre retorna uma Promise que RESOLVE com { status }:
       'ok'        → compra concluída
       'cancelled' → usuário cancelou
       'fallback'  → aberto modal "compre no app"
       'error'     → falha inesperada
     Nunca rejeita, para não gerar unhandled rejection na WebView. */
  function buy(p, opts) {
    opts = opts || {};
    if (U.isFree(p)) return download(p);

    if (!window.AliveBridge.isNative()) {
      openFallback(p);
      return Promise.resolve({ status: 'fallback' });
    }

    var btn = opts.button;
    if (btn) {
      btn.disabled = true;
      btn.dataset.oldText = btn.textContent;
      btn.textContent = 'Processando…';
    }
    var restore = function () {
      if (btn) {
        btn.disabled = false;
        if (btn.dataset.oldText) btn.textContent = btn.dataset.oldText;
      }
    };

    return window.AliveBridge.purchase({
      productId: p.playId,
      title: p.name,
      priceLabel: U.brl(p.price),
      payload: { storeUrl: location.href.split('?')[0] + '?id=' + p.id }
    }).then(function (res) {
      U.toast(p.name + ' liberado no app Alive!', 'ok');
      if (opts.onSuccess) opts.onSuccess(res);
      return { status: 'ok', data: res };
    }).catch(function (err) {
      var code = (err && err.code) || 'error';
      if (code === 'cancelled') U.toast('Compra cancelada');
      else if (code === 'not-native') { openFallback(p); code = 'fallback'; }
      else U.toast('Não foi possível concluir a compra', 'err');
      return { status: code };
    }).then(function (r) { restore(); return r; }, function (e) { restore(); throw e; });
  }

  /* ---------------- Download (grátis) ---------------- */
  function download(p) {
    var url = p.downloadUrl || ('downloads/' + p.id + '.zip');
    return window.AliveBridge.download(url).then(function () {
      U.toast('Download de ' + p.name + ' iniciado', 'ok');
      return { status: 'ok' };
    }).catch(function () {
      U.toast('Não foi possível baixar agora', 'err');
      return { status: 'error' };
    });
  }

  /* ---------------- Compartilhar ---------------- */
  function share(p) {
    var text = 'Olha esse overlay da loja Alive: ' + p.name + ' — ' +
      (U.isFree(p) ? 'grátis' : U.brl(p.price)) + '\n' +
      location.origin + location.pathname + '?id=' + p.id;
    window.AliveBridge.share(text);
    U.toast('Link copiado para compartilhar', 'ok');
  }

  window.ALIVE_ACTIONS = {
    buy: buy,
    download: download,
    share: share,
    openFallback: openFallback,
    closeFallback: closeFallback
  };
})();
