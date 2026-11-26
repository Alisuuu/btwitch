/* ==========================================================================
   ALIVE STORE — Temas vindos do storage (Telegram)

   Busca GET /api/themes (servidor extrai theme.json dos zips postados no
   grupo) e converte cada tema num produto do catálogo, usando OS DADOS DO
   JSON: nome, descrição, autor, versão, preview_image, standby, widgets…

   Se a loja estiver aberta fora do servidor (file:// ou sem backend),
   a seção simplesmente não aparece — o resto da loja funciona normal.
   ========================================================================== */
(function () {
  'use strict';

  var U = window.ALIVE_UI;
  var API = '/api/themes';
  var injected = [];

  function mb(bytes) {
    if (!bytes) return '—';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  function dt(iso) { return (iso || '').slice(0, 10); }

  /* theme.json → produto do catálogo */
  function toProduct(t) {
    var id = 'tema-' + (t.themeId || t.id);
    var includes = [];
    var widgets = t.widgets || [];

    if (t.standby && t.standby.enabled) {
      includes.push('Standby em vídeo: "' + t.standby.title + '" — ' + t.standby.subtitle);
    }
    includes.push(widgets.length + ' widget(s): ' +
      (widgets.length ? widgets.map(function (w) { return w.name; }).join(', ') : 'nenhum'));
    if (t.frame && t.frame.enabled) {
      includes.push('Moldura com borda ' + t.frame.border_color + ' (' + t.frame.border_width + 'px)');
    }
    if (t.background && t.background.enabled) includes.push('Imagem de fundo');
    includes.push('Todos os assets originais em .zip');
    includes.push('Tema do ' + (t.author || 'Alive') + ' · versão ' + (t.version || '1.0'));

    return {
      id: id,
      playId: 'theme_' + (t.themeId || t.id),
      name: t.name || 'Tema sem nome',
      author: t.author || 'Alive Studio',
      tagline: t.description || 'Tema de overlay para a sua live.',
      description: (t.description || 'Tema completo para overlay.') +
        ' Instalado direto no app Alive.',
      category: 'tema',
      price: 0,
      badge: 'new',
      featured: 96,
      salesCount: 0,
      releasedAt: dt(t.uploadedAt),
      version: t.version || '1.0',
      updated: dt(t.uploadedAt),
      size: mb(t.size),
      includes: includes,
      compat: ['Alive App'],
      image: t.previewUrl,          // fallback: imagem estática do tema
      standbyVideo: t.standbyUrl || (t.assetBase && t.standby && t.standby.file ? t.assetBase + encodeURIComponent(t.standby.file) : null),
      assetBase: t.assetBase || '',
      downloadUrl: t.downloadUrl,
      theme: t,
      themeInfo: t                  // dados brutos do JSON pro modal
    };
  }

  function request(url, cb) {
    try {
      if (typeof fetch === 'function') {
        fetch(url, { headers: { 'Accept': 'application/json' } })
          .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
          .then(function (d) { cb(null, d); })
          .catch(function (e) { cb(e); });
        return;
      }
      if (typeof XMLHttpRequest === 'undefined') { cb(new Error('sem suporte a rede')); return; }
      var xhr = new XMLHttpRequest();          // fallback p/ WebView antiga
      xhr.open('GET', url, true);
      xhr.timeout = 8000;
      xhr.onload = function () {
        try { cb(null, JSON.parse(xhr.responseText)); } catch (e) { cb(e); }
      };
      xhr.onerror = function () { cb(new Error('sem rede')); };
      xhr.ontimeout = function () { cb(new Error('timeout')); };
      xhr.send();
    } catch (e) { cb(e); }
  }

  var CACHE_KEY = 'ALIVE_COMMUNITY_THEMES';

  function applyThemes(themesList) {
    if (!Array.isArray(themesList)) return [];
    var cat = window.ALIVE_CATALOG;
    var products = themesList.map(toProduct);

    // Deduplicação segura: só substitui se for do MESMO AUTOR!
    var norm = function (s) { return String(s || '').trim().toLowerCase().replace(/[^a-z0-9]/g, ''); };
    var newAuthors = products.map(function (p) { return norm(p.author || (p.themeInfo && p.themeInfo.author)); });
    var newNames = products.map(function (p) { return norm(p.name); });
    var newIds = products.map(function (p) { return p.id; });
    var newThemeIds = products.map(function (p) { return p.themeInfo && p.themeInfo.themeId; }).filter(Boolean);

    for (var i = cat.length - 1; i >= 0; i--) {
      var item = cat[i];
      var itemAuthor = norm(item.author || (item.themeInfo && item.themeInfo.author));
      var itemTid = item.themeInfo && item.themeInfo.themeId;
      var itemName = norm(item.name);

      // Só remove tema anterior se o ID bater ou se for o MESMO NOME + MESMO AUTOR
      var isSameAuthorTheme = newNames.some(function (nm, idx) {
        return nm === itemName && (!itemAuthor || !newAuthors[idx] || itemAuthor === newAuthors[idx]);
      });

      if (injected.indexOf(item.id) !== -1 ||
          newIds.indexOf(item.id) !== -1 ||
          (itemTid && newThemeIds.indexOf(itemTid) !== -1) ||
          isSameAuthorTheme) {
        cat.splice(i, 1);
      }
    }

    injected = products.map(function (p) { return p.id; });
    Array.prototype.push.apply(cat, products);
    window.ALIVE_THEMES = products;

    try {
      document.dispatchEvent(new CustomEvent('alive:themes', { detail: { count: products.length } }));
    } catch (e) {
      var ev = document.createEvent('Event');
      ev.initEvent('alive:themes', false, false);
      document.dispatchEvent(ev);
    }
    return products;
  }

  function load() {
    // Carrega instantaneamente do cache local se disponível (imunidade a spin down de 50s no Render)
    try {
      var cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        var parsed = JSON.parse(cached);
        if (parsed && Array.isArray(parsed.themes)) {
          applyThemes(parsed.themes);
        }
      }
    } catch (e) {}

    request(API, function (err, data) {
      var products = [];
      try {
        if (!err && data && Array.isArray(data.themes)) {
          products = applyThemes(data.themes);
          try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (e) {}
        } else if (window.console) {
          console.info('[themes] storage indisponível — usando catálogo estático');
        }
      } catch (e) {
        products = [];
        if (window.console) console.warn('[themes] falha ao montar catálogo:', e);
      }

      if (window.console && products.length) {
        console.info('[themes] ' + products.length + ' tema(s) carregado(s) da comunidade');
      }
    });
  }

  window.ALIVE_THEMES_API = { load: load, toProduct: toProduct };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();
