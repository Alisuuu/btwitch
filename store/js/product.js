/* ==========================================================================
   ALIVE STORE — controller da página de detalhe (overlay.html?id=xxx)
   Os temas chegam depois (fetch pro servidor), então a página re-renderiza
   quando o evento `alive:themes` dispara.
   ========================================================================== */
(function () {
  'use strict';

  var U = window.ALIVE_UI;
  var A = window.ALIVE_ACTIONS;

  var wantedId = null;
  var renderedId = null;
  var themesSettled = false;

  function param(name) {
    var m = new RegExp('[?&]' + name + '=([^&]*)').exec(location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null;
  }

  function $(id) { return document.getElementById(id); }

  function showMissing(on) {
    var msg = $('detailNotFound');
    var grid = $('detailGrid');
    if (msg) msg.style.display = on ? '' : 'none';
    if (grid) grid.style.display = on ? 'none' : '';
  }

  function notFound() {
    renderedId = null;
    showMissing(true);
    var rw = $('relatedWrap');
    if (rw) rw.style.display = 'none';
  }

  function renderDetail(p) {
    renderedId = p.id;
    showMissing(false);
    document.title = p.name + ' — Alive Store';
    var meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', p.name + ': ' + p.tagline);

    $('detailArt').innerHTML = U.previewHtml(p, { controls: true });
    $('detailCat').textContent = U.catLabel(p.category);
    $('detailName').textContent = p.name;
    $('detailTag').textContent = p.tagline;
    $('detailDesc').textContent = p.description;
    $('detailBadge').innerHTML = U.badgeHtml(p);

    $('detailPriceBox').innerHTML =
      '<div>' + U.priceHtml(p) + '</div>' +
      '<span class="muted" style="font-size:13px">' +
      (U.isFree(p) ? 'Licença de uso pessoal' : 'Pagamento único · sem assinatura') + '</span>';

    $('detailIncludes').innerHTML =
      (p.includes || []).map(function (i) { return '<li>' + U.esc(i) + '</li>'; }).join('');

    $('detailCompat').innerHTML =
      (p.compat || []).map(function (c) { return '<span class="tag">' + U.esc(c) + '</span>'; }).join('');

    $('detailMeta').innerHTML =
      '<div class="meta-item"><span>Versão</span><b>' + U.esc(p.version || '1.0') + '</b></div>' +
      '<div class="meta-item"><span>Atualizado</span><b>' + U.esc(p.updated || '—') + '</b></div>' +
      '<div class="meta-item"><span>Tamanho</span><b>' + U.esc(p.size || '—') + '</b></div>' +
      '<div class="meta-item"><span>Licença</span><b>Pessoal</b></div>' +
      '<div class="meta-item"><span>Entrega</span><b>Automática</b></div>' +
      '<div class="meta-item"><span>Categoria</span><b>' + U.esc(U.catLabel(p.category)) + '</b></div>';

    $('detailExtra').innerHTML = p.themeInfo ? U.themeExtraHtml(p) : '';

    var buyBtn = $('detailBuy');
    buyBtn.textContent = U.isFree(p) ? 'Baixar' : 'Comprar no app';
    buyBtn.className = 'btn btn-lg ' + (U.isFree(p) ? '' : 'btn-primary');
    buyBtn.onclick = function () {
      U.isFree(p) ? A.download(p) : A.buy(p, { button: buyBtn });
    };

    $('detailShare').onclick = function () { A.share(p); };

    // relacionados (inclui temas, se o storage devolveu algum)
    var rel = window.ALIVE_HELPERS.related(p.id, 3);
    $('relatedGrid').innerHTML = rel.map(U.cardHtml).join('');
    $('relatedWrap').style.display = rel.length ? '' : 'none';
    U.observeReveal($('relatedGrid'));
    U.manageVideos($('relatedGrid'));
  }

  /** Resolve o id desejado: renderiza, ou espera os temas, ou mostra 404. */
  function render() {
    var p = wantedId ? window.ALIVE_HELPERS.byId(wantedId) : null;
    if (p) {
      if (renderedId === p.id) return;   // nada mudou
      renderDetail(p);
      return;
    }
    // ainda não chegou o fetch dos temas → espera o evento `alive:themes`
    if (themesSettled || !wantedId) notFound();
  }

  function init() {
    wantedId = param('id');

    document.addEventListener('alive:themes', function () {
      themesSettled = true;
      render();
    });

    // clique nos cards de "relacionados"
    $('relatedGrid').addEventListener('click', function (e) {
      var card = e.target.closest('.card');
      if (card) location.href = 'overlay.html?id=' + encodeURIComponent(card.dataset.id);
    });

    render();

    // rede morrendo: não deixa a página em branco pra sempre
    setTimeout(function () { if (!renderedId) notFound(); }, 5000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
