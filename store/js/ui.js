/* ==========================================================================
   ALIVE STORE — utilidades de UI (formatos, cards, previews, toasts)
   ========================================================================== */
(function () {
  'use strict';

  var C = window.ALIVE_CATEGORIES || [];
  var CAT_LABEL = {};
  C.forEach(function (c) { CAT_LABEL[c.id] = c.label; });

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function brl(v) {
    if (v === 0) return '';
    try {
      return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    } catch (e) { return 'R$ ' + v.toFixed(2).replace('.', ','); }
  }

  function num(n) {
    if (n >= 1000) return (n / 1000).toFixed(1).replace('.', ',') + 'k';
    return String(n);
  }

  function isFree(p) { return !p.price || p.price <= 0; }

  function badgeHtml(p) {
    if (p.badge === 'hot') return '<span class="badge">Mais vendido</span>';
    if (p.badge === 'new') return '<span class="badge">Novo</span>';
    if (p.badge === 'sale') return '<span class="badge">Promoção</span>';
    return '';
  }

  function priceHtml(p) {
    if (isFree(p)) return '';
    var old = p.oldPrice ? '<span class="price-old">' + brl(p.oldPrice) + '</span>' : '';
    return '<span class="price">' + brl(p.price) + '</span>' + old;
  }

  /* ------------------------------------------------------------------
     PREVIEW — ordem de preferência:
       1. tela de espera (vídeo real do tema)
       2. imagem real (asset do tema)
       3. arte gerada (SVG)
     ------------------------------------------------------------------ */
  function previewHtml(p, opts) {
    opts = opts || {};

    // 1. Topo do Popup (Modal): SEMPRE a Tela de Espera
    if (opts.modal || opts.controls) {
      if (p.standbyVideo) {
        return '<video class="preview-video modal-preview-video" autoplay loop muted playsinline controls src="' + esc(p.standbyVideo) + '" aria-label="Tela de espera"></video>';
      }
      if (p.isAnime) {
        var bgUrl = p.backdropUrl || p.posterUrl || p.image || '';
        var animeName = esc(p.name || 'ALIVE').toUpperCase();
        return '' +
          '<div class="anime-standby-stage" style="background-image:linear-gradient(to bottom, rgba(0,0,0,0.45), rgba(0,0,0,0.85)), url(\'' + esc(bgUrl) + '\');">' +
            '<div class="anime-standby-center">' +
              '<span class="anime-standby-title">Aguarde um momento</span>' +
            '</div>' +
          '</div>';
      }
    }

    // 2. Nos Cards do Grid:
    // A. Comunidade: Tela de espera (vídeo loop real como capa)
    if (p.standbyVideo) {
      return '<video class="preview-video" autoplay muted loop playsinline webkit-playsinline preload="auto" ' +
        (p.image ? 'poster="' + esc(p.image) + '" ' : '') +
        'src="' + esc(p.standbyVideo) + '"></video>';
    }

    // B. Alive: COMPOSIÇÃO do overlay no card
    if (p.isAnime && window.AliveArt && window.AliveArt.animeComposition) {
      return window.AliveArt.animeComposition(p);
    }

    // C. Pagos / Imagem estática
    if (p.image) {
      return '<img src="' + esc(p.image) + '" alt="Preview de ' + esc(p.name) + '" loading="lazy">';
    }
    try {
      if (window.AliveArt && window.AliveArt.html) {
        return window.AliveArt.html(p);
      }
    } catch (e) {}
    return '<svg viewBox="0 0 640 360" role="img"><rect width="640" height="360" fill="#0c0c14"/><text x="320" y="180" text-anchor="middle" font-size="18" font-weight="700" fill="#ffffff">' + esc(p.name || 'Alive') + '</text></svg>';
  }

  function cardHtml(p) {
    var author = p.author || (p.themeInfo && p.themeInfo.author) || (p.theme && p.theme.author) || (p.isAnime ? 'Alive Studio' : '');
    var subtitle = p.isAnime ? 'Overlay Celular & Tablet' : (p.tagline || 'Overlay para transmissão');
    return '' +
      '<article class="card reveal" data-id="' + esc(p.id) + '" tabindex="0" role="button" aria-label="Ver ' + esc(p.name) + '">' +
        '<div class="card-art">' +
          badgeHtml(p) +
          previewHtml(p) +
        '</div>' +
        '<div class="card-body">' +
          '<h3 class="card-title">' + esc(p.name) + '</h3>' +
          (author ? '<p class="card-author">por <span>' + esc(author) + '</span></p>' : '') +
          '<p class="card-tag">' + esc(subtitle) + '</p>' +
          '<div class="card-foot">' +
            '<span class="card-compat-pill">Pronto para o app</span>' +
            '<span class="btn btn-sm btn-action" aria-hidden="true">' +
              (isFree(p) ? 'Baixar' : 'Comprar') +
            '</span>' +
          '</div>' +
        '</div>' +
      '</article>';
  }

  /* ------------------------------------------------------------------
     DETALHES DO TEMA (lidos do theme.json)
     ------------------------------------------------------------------ */
  function themeExtraHtml(p) {
    var t = p.themeInfo;
    if (!t) return '';
    var widgets = t.widgets || [];

    var rows = widgets.map(function (w) {
      return '<li>' +
        '<span class="dot"></span>' +
        '<span class="tk">' + esc(w.name || 'Widget') + '</span>' +
        '<span class="tv">' + esc(w.type || 'image') + ' · ' +
          esc(String(w.width || '?')) + '×' + esc(String(w.height || '?')) + '</span>' +
      '</li>';
    }).join('');

    // Standby box apenas para temas de comunidade que não possuem o palco chaveado no topo
    var standby = '';
    if (t.standby && t.standby.enabled && !p.isAnime) {
      standby =
        '<div class="standby-box">' +
          '<span class="card-cat">Tela de espera</span>' +
          '<b>' + esc(t.standby.title || '—') + '</b>' +
          '<span>' + esc(t.standby.subtitle || '') + '</span>' +
          '<span class="tag">' + esc(t.standby.type || '') + '</span>' +
        '</div>';
    }

    // Composição blueprint apenas se o topo já não for a própria composição interativa
    var layout = (widgets.length && !p.isAnime)
      ? '<div class="layout-box">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px">' +
            '<h4 style="margin:0">Composição · 1920×1080</h4>' +
            '<button type="button" class="layout-standby-btn" id="layoutStandbyBtn">' +
              '<span style="width:6px;height:6px;border-radius:50%;background:#00E5FF;display:inline-block"></span>' +
              'Tela de espera' +
            '</button>' +
          '</div>' +
          window.AliveArt.layoutSvg(widgets, t.assetBase, t.viewport) +
        '</div>'
      : '';

    return '' +
      '<details class="theme-details-accordion">' +
        '<summary class="theme-details-summary">' +
          '<span>Especificações técnicas</span>' +
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>' +
        '</summary>' +
        '<div class="theme-extra">' +
          '<div class="meta-grid">' +
            '<div class="meta-item"><span>Autor</span><b>' + esc(t.author || '—') + '</b></div>' +
            '<div class="meta-item"><span>Versão</span><b>' + esc(t.version || '—') + '</b></div>' +
            '<div class="meta-item"><span>Widgets</span><b>' + (t.widgetCount || 0) + '</b></div>' +
            '<div class="meta-item"><span>Perfil</span><b>' + esc(t.target_profile || '—') + '</b></div>' +
            '<div class="meta-item"><span>Borda</span><b>' +
              (t.frame && t.frame.enabled ? esc(t.frame.border_color || 'sim') : 'desligada') + '</b></div>' +
            '<div class="meta-item"><span>ID</span><b>' + esc(String(t.themeId || '—').slice(0, 8)) + '</b></div>' +
          '</div>' +
          standby +
          layout +
          (rows ? '<div><h4>Camadas</h4><ul class="widget-list">' + rows + '</ul></div>' : '') +
        '</div>' +
      '</details>';
  }

  /* ---------------- Toast ---------------- */
  var toastWrap;
  function toast(msg) {
    if (!toastWrap) {
      toastWrap = document.createElement('div');
      toastWrap.className = 'toast-wrap';
      document.body.appendChild(toastWrap);
    }
    var el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.textContent = msg;
    toastWrap.appendChild(el);
    setTimeout(function () {
      el.classList.add('out');
      setTimeout(function () { el.remove(); }, 260);
    }, 2600);
  }

  /* ---------------- Reveal on scroll ---------------- */
  function observeReveal(root) {
    var els = (root || document).querySelectorAll('.reveal:not(.visible)');
    if (!('IntersectionObserver' in window)) {
      els.forEach(function (el) { el.classList.add('visible'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -40px 0px', threshold: 0.06 });
    els.forEach(function (el, i) {
      el.style.transitionDelay = Math.min(i % 8, 7) * 45 + 'ms';
      io.observe(el);
    });
  }

  /* Vídeos do card só tocam quando visíveis (economia de bateria/dados) */
  function manageVideos(root) {
    var vids = (root || document).querySelectorAll('video.preview-video:not([controls])');
    if (!('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var v = e.target;
        if (e.isIntersecting) { var pr = v.play(); if (pr && pr.catch) pr.catch(function () {}); }
        else v.pause();
      });
    }, { threshold: 0.25 });
    vids.forEach(function (v) { io.observe(v); });
  }

  // Delegação de clique no botão "Tela de espera" da área de composição
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('#layoutStandbyBtn');
    if (!btn) return;
    if (window.ALIVE_ANIME && window.ALIVE_ANIME.setModalView) {
      window.ALIVE_ANIME.setModalView('standby');
    }
    var art = document.getElementById('modalArt');
    if (art) {
      art.scrollIntoView({ behavior: 'smooth', block: 'center' });
      art.style.boxShadow = '0 0 24px rgba(0, 229, 255, 0.45)';
      setTimeout(function () { art.style.boxShadow = ''; }, 1200);
    }
  });

  /* ---------------- Efeito Ripple em todos os botões ---------------- */
  document.addEventListener('pointerdown', function (e) {
    var btn = e.target.closest('button, .btn, .tab-btn, .seg-item, .standby-pick-btn, .layout-standby-btn, .art-switch-btn, .btn-icon, .logo-pick, .backdrop-pick');
    if (!btn) return;

    var rect = btn.getBoundingClientRect();
    var size = Math.max(rect.width, rect.height);
    var x = e.clientX - rect.left - size / 2;
    var y = e.clientY - rect.top - size / 2;

    var ripple = document.createElement('span');
    ripple.className = 'ripple-effect';
    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';

    btn.appendChild(ripple);

    setTimeout(function () {
      if (ripple.parentNode) ripple.parentNode.removeChild(ripple);
    }, 600);
  }, { passive: true });

  /* ---------------- Proteção anti-cópia e toque longo em textos e imagens ---------------- */
  document.addEventListener('contextmenu', function (e) {
    if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
    }
  });

  document.addEventListener('dragstart', function (e) {
    e.preventDefault();
  });

  document.addEventListener('selectstart', function (e) {
    if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
    }
  });

  document.addEventListener('copy', function (e) {
    if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
    }
  });

  window.ALIVE_UI = {
    esc: esc, brl: brl, num: num, isFree: isFree,
    badgeHtml: badgeHtml, priceHtml: priceHtml,
    cardHtml: cardHtml, previewHtml: previewHtml,
    themeExtraHtml: themeExtraHtml,
    toast: toast, observeReveal: observeReveal, manageVideos: manageVideos,
    catLabel: function (id) { return CAT_LABEL[id] || id; }
  };
})();
