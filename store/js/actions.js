/* ==========================================================================
   ALIVE STORE — ações de compra e download
   Compra in-app (Google Play Billing via WebView) + fallback fora do app.
   ========================================================================== */
(function () {
  'use strict';

  var U = window.ALIVE_UI;
  var CFG = window.ALIVE_CONFIG;
  var I = window.ALIVE_I18N;
  function t(k, vars) { return I ? I.t(k, vars) : k; }

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
        '<button class="btn-icon modal-close" data-close aria-label="' + U.esc(t('aria_close')) + '">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
        '</button>' +
        '<div class="modal-content" style="padding:30px 26px 28px;text-align:center">' +
          '<div style="width:56px;height:56px;border-radius:16px;background:#ffffff;color:#000000;display:grid;place-items:center;font-size:26px;margin:0 auto 6px">▶</div>' +
          '<h3 id="fbTitle" class="display" style="margin:6px 0 4px;font-size:20px">' + U.esc(t('fb_title')) + '</h3>' +
          '<p class="muted" id="fbText" style="margin:0 0 4px;font-size:14px"></p>' +
          '<div class="tag-row" id="fbTags" style="justify-content:center;margin:10px 0 18px"></div>' +
          '<div style="display:flex;flex-direction:column;gap:10px">' +
            '<button class="btn btn-primary btn-block btn-lg" id="fbStore">' + U.esc(t('fb_store')) + '</button>' +
            '<button class="btn btn-block" id="fbWhats">' + U.esc(t('fb_support')) + '</button>' +
          '</div>' +
          '<p class="note" style="margin-top:14px">' + U.esc(t('fb_note')) + '</p>' +
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
        encodeURIComponent(t('fb_whats_msg')));
    });
    return wrap;
  }

  function openFallback(p) {
    var m = ensureFallbackModal();
    document.getElementById('fbText').textContent = window.AliveBridge.isNative()
      ? t('fb_text_native')
      : t('fb_text_web');
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
      btn.textContent = t('processing');
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
      U.toast(t('buy_unlocked', { name: p.name }), 'ok');
      if (opts.onSuccess) opts.onSuccess(res);
      return { status: 'ok', data: res };
    }).catch(function (err) {
      var code = (err && err.code) || 'error';
      if (code === 'cancelled') U.toast(t('buy_cancelled'));
      else if (code === 'not-native') { openFallback(p); code = 'fallback'; }
      else U.toast(t('buy_error'), 'err');
      return { status: code };
    }).then(function (r) { restore(); return r; }, function (e) { restore(); throw e; });
  }

  /* ---------------- Download (grátis) ---------------- */
  function download(p) {
    var url = p.downloadUrl || ('downloads/' + p.id + '.zip');
    return window.AliveBridge.download(url).then(function () {
      U.toast(t('dl_started', { name: p.name }), 'ok');
      return { status: 'ok' };
    }).catch(function () {
      U.toast(t('dl_error'), 'err');
      return { status: 'error' };
    });
  }

  /* ---------------- Compartilhar ---------------- */
  function share(p) {
    var text = t('share_text', {
      name: p.name,
      price: U.isFree(p) ? t('share_free') : U.brl(p.price),
      url: location.origin + location.pathname + '?id=' + p.id
    });
    window.AliveBridge.share(text);
    U.toast(t('share_copied'), 'ok');
  }

  /* ---------------- Denunciar ---------------- */
  var rpModal = null;
  var rpTarget = null;

  function ensureReportModal() {
    if (rpModal) return rpModal;
    var wrap = document.createElement('div');
    wrap.className = 'modal';
    wrap.id = 'reportModal';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-labelledby', 'rpTitle');
    var reasons = [
      t('report_r_inappropriate'),
      t('report_r_copyright'),
      t('report_r_broken'),
      t('report_r_other')
    ];
    var reasonsHtml = reasons.map(function (r, idx) {
      return '<button type="button" class="seg-item rp-reason-btn' + (idx === 0 ? ' active' : '') + '" data-reason="' + U.esc(r) + '" style="flex:1 1 calc(50% - 6px);text-align:center">' + U.esc(r) + '</button>';
    }).join('');

    wrap.innerHTML =
      '<div class="modal-backdrop" data-close-rp></div>' +
      '<div class="modal-panel" style="width:min(440px,calc(100% - 28px))">' +
        '<button type="button" class="modal-close" data-close-rp aria-label="' + U.esc(t('aria_close')) + '">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
        '</button>' +
        '<div class="modal-scroll-wrap">' +
          '<div style="display:flex;flex-direction:column;gap:12px;padding:26px 24px 24px">' +
            '<div>' +
              '<h3 id="rpTitle" class="display" style="margin:0 36px 6px 0;font-size:20px">' + U.esc(t('report_title')) + '</h3>' +
              '<p class="muted" style="margin:0;font-size:13.5px">' + U.esc(t('report_sub')) + '</p>' +
            '</div>' +
            '<div class="seg-group">' +
              '<span class="seg-label">' + U.esc(t('report_reason_label')) + '</span>' +
              '<div class="seg-row" id="rpReasonRow">' + reasonsHtml + '</div>' +
            '</div>' +
            '<label style="font-size:12px;color:var(--muted);display:flex;flex-direction:column;gap:6px">' +
              U.esc(t('report_details_label')) +
              '<textarea id="rpDetails" rows="3" maxlength="400" placeholder="' + U.esc(t('report_details_ph')) + '" style="padding:10px 12px;border-radius:10px;background:rgba(255,255,255,0.06);color:#fff;border:1px solid rgba(255,255,255,0.14);font-size:13.5px;resize:vertical;font-family:inherit"></textarea>' +
            '</label>' +
            '<button class="btn btn-primary btn-block btn-lg" id="rpSubmit" type="button">' + U.esc(t('report_submit')) + '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);
    rpModal = wrap;

    wrap.addEventListener('click', function (e) {
      if (e.target.closest('[data-close-rp]')) { closeReport(); return; }
      var rBtn = e.target.closest('.rp-reason-btn');
      if (rBtn) {
        wrap.querySelectorAll('.rp-reason-btn').forEach(function (b) { b.classList.remove('active'); });
        rBtn.classList.add('active');
      }
    });

    document.getElementById('rpSubmit').addEventListener('click', function () {
      if (!rpTarget) return;
      var btn = document.getElementById('rpSubmit');
      var activeReason = wrap.querySelector('.rp-reason-btn.active');
      var detailsEl = document.getElementById('rpDetails');
      var reason = activeReason ? activeReason.getAttribute('data-reason') : 'other';
      var details = detailsEl ? detailsEl.value.trim() : '';

      var idMatch = /\/api\/themes\/([^/]+)\//i.exec(rpTarget.downloadUrl || '');
      var reportId = (idMatch && idMatch[1]) || (rpTarget.themeInfo && rpTarget.themeInfo.themeId) || rpTarget.id || 'unknown';
      var author = rpTarget.author || (rpTarget.themeInfo && rpTarget.themeInfo.author) || '—';

      btn.disabled = true;
      btn.textContent = t('report_sending');
      fetch('/api/themes/' + encodeURIComponent(reportId) + '/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          themeName: rpTarget.name || reportId,
          author: author,
          reason: reason,
          details: details
        })
      }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        U.toast(t('report_sent'), 'ok');
        closeReport();
      }).catch(function () {
        U.toast(t('report_err'), 'err');
      }).then(function () {
        btn.disabled = false;
        btn.textContent = t('report_submit');
      });
    });

    return wrap;
  }

  function openReport(p) {
    rpTarget = p;
    var m = ensureReportModal();
    var detailsEl = document.getElementById('rpDetails');
    if (detailsEl) detailsEl.value = '';
    m.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeReport() {
    if (rpModal) rpModal.classList.remove('open');
    if (!document.querySelector('.modal.open')) document.body.style.overflow = '';
  }

  window.ALIVE_ACTIONS = {
    buy: buy,
    download: download,
    share: share,
    openReport: openReport,
    closeReport: closeReport,
    openFallback: openFallback,
    closeFallback: closeFallback
  };
})();
