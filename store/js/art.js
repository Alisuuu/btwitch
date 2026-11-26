/* ==========================================================================
   ALIVE STORE — gerador de previews em SVG
   Cada produto recebe uma arte vetorial que simula o overlay numa live.
   Se o produto tiver `image` (png/jpg), a imagem é usada no lugar do SVG.
   ========================================================================== */
(function () {
  'use strict';

  var seq = 0;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function defs(uid, p) {
    var t = (p && (p.theme || p.themeInfo)) || {};
    return '' +
      '<defs>' +
        '<linearGradient id="bg' + uid + '" x1="0" y1="0" x2="1" y2="1">' +
          '<stop offset="0" stop-color="' + esc(t.bg1 || '#12122a') + '"/>' +
          '<stop offset="1" stop-color="' + esc(t.bg2 || '#070711') + '"/>' +
        '</linearGradient>' +
        '<linearGradient id="ac' + uid + '" x1="0" y1="0" x2="1" y2="0">' +
          '<stop offset="0" stop-color="' + esc(t.a1 || '#8b5cf6') + '"/>' +
          '<stop offset="1" stop-color="' + esc(t.a2 || '#22d3ee') + '"/>' +
        '</linearGradient>' +
        '<filter id="gl' + uid + '" x="-60%" y="-60%" width="220%" height="220%">' +
          '<feGaussianBlur stdDeviation="7" result="b"/>' +
          '<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>' +
        '</filter>' +
        '<pattern id="gr' + uid + '" width="34" height="34" patternUnits="userSpaceOnUse">' +
          '<path d="M34 0H0v34" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="1"/>' +
        '</pattern>' +
      '</defs>';
  }

  function bg(uid) {
    return '<rect width="640" height="360" fill="url(#bg' + uid + ')"/>' +
           '<rect width="640" height="360" fill="url(#gr' + uid + ')"/>';
  }

  function livePill(uid, t) {
    t = t || {};
    return '' +
      '<g transform="translate(24,22)">' +
        '<rect width="86" height="30" rx="9" fill="rgba(6,6,12,.72)" stroke="' + esc(t.a1 || '#8b5cf6') + '" stroke-opacity=".65"/>' +
        '<circle cx="17" cy="15" r="5" fill="#fb7185"/>' +
        '<text x="30" y="20" font-size="13" font-weight="800" fill="#fff" letter-spacing="1.5">LIVE</text>' +
      '</g>' +
      '<g transform="translate(118,22)">' +
        '<rect width="74" height="30" rx="9" fill="rgba(6,6,12,.6)" stroke="rgba(255,255,255,.14)"/>' +
        '<text x="14" y="20" font-size="12.5" font-weight="700" fill="rgba(255,255,255,.82)">1.2k ▸</text>' +
      '</g>';
  }

  function camFrame(uid, t, x, y, w, h) {
    t = t || {};
    var a1 = t.a1 || '#8b5cf6', a2 = t.a2 || '#22d3ee';
    return '' +
      '<g filter="url(#gl' + uid + ')">' +
        '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="14" fill="rgba(8,8,16,.72)" stroke="url(#ac' + uid + ')" stroke-width="3"/>' +
      '</g>' +
      '<rect x="' + (x + 8) + '" y="' + (y + 8) + '" width="' + (w - 16) + '" height="' + (h - 16) + '" rx="9" fill="none" stroke="rgba(255,255,255,.10)"/>' +
      '<circle cx="' + (x + 22) + '" cy="' + (y + 22) + '" r="5" fill="' + esc(a1) + '"/>' +
      '<circle cx="' + (x + w - 22) + '" cy="' + (y + h - 22) + '" r="5" fill="' + esc(a2) + '"/>';
  }

  function chatPanel(uid, t) {
    t = t || {};
    var a1 = t.a1 || '#8b5cf6', a2 = t.a2 || '#22d3ee';
    var lines = [
      { w: 96, c: a1 }, { w: 72, c: 'rgba(255,255,255,.35)' },
      { w: 108, c: a2 }, { w: 64, c: 'rgba(255,255,255,.3)' },
      { w: 88, c: a1 }, { w: 54, c: 'rgba(255,255,255,.28)' }
    ];
    var out = '<g transform="translate(474,74)">' +
      '<rect width="142" height="234" rx="14" fill="rgba(8,8,16,.7)" stroke="rgba(255,255,255,.14)"/>' +
      '<rect x="12" y="12" width="60" height="9" rx="4.5" fill="url(#ac' + uid + ')"/>';
    lines.forEach(function (l, i) {
      var y = 36 + i * 30;
      out += '<circle cx="19" cy="' + (y + 5) + '" r="7" fill="rgba(255,255,255,.14)"/>' +
             '<rect x="32" y="' + y + '" width="' + l.w + '" height="10" rx="5" fill="' + l.c + '" opacity=".75"/>';
    });
    return out + '</g>';
  }

  function alertBanner(uid, t) {
    t = t || {};
    var a2 = t.a2 || '#22d3ee';
    return '' +
      '<g transform="translate(180,66)" filter="url(#gl' + uid + ')">' +
        '<rect width="280" height="74" rx="16" fill="rgba(8,8,16,.86)" stroke="url(#ac' + uid + ')" stroke-width="2.5"/>' +
        '<circle cx="42" cy="37" r="20" fill="' + esc(a2) + '" opacity=".22"/>' +
        '<text x="34" y="44" font-size="20">★</text>' +
        '<rect x="74" y="22" width="130" height="12" rx="6" fill="rgba(255,255,255,.85)"/>' +
        '<rect x="74" y="42" width="92" height="9" rx="4.5" fill="rgba(255,255,255,.4)"/>' +
      '</g>';
  }

  function watermark() {
    return '';
  }

  /* ---------- layouts por categoria ---------- */
  var layouts = {
    tela: function (uid, p) {
      var t = (p && (p.theme || p.themeInfo)) || {};
      return livePill(uid, t) + chatPanel(uid, t) +
             camFrame(uid, t, 24, 176, 250, 150);
    },
    tema: function (uid, p) {
      var t = (p && (p.theme || p.themeInfo)) || {};
      return livePill(uid, t) +
             chatPanel(uid, t) +
             camFrame(uid, t, 24, 176, 250, 150);
    },
    cenas: function (uid, p) {
      var t = (p && (p.theme || p.themeInfo)) || {}, title = (p.sceneTitle || 'STARTING SOON').toUpperCase();
      return '' +
        '<g transform="translate(0,0)">' +
          '<circle cx="320" cy="170" r="120" fill="none" stroke="url(#ac' + uid + ')" stroke-width="2" opacity=".35"/>' +
          '<circle cx="320" cy="170" r="92" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="1.5" stroke-dasharray="6 9"/>' +
          '<text x="320" y="164" text-anchor="middle" font-size="34" font-weight="800" fill="#fff" letter-spacing="3">' + esc(title) + '</text>' +
          '<g transform="translate(268,186)">' +
            '<rect width="104" height="34" rx="17" fill="rgba(6,6,12,.7)" stroke="url(#ac' + uid + ')" stroke-width="2"/>' +
            '<text x="52" y="23" text-anchor="middle" font-size="15" font-weight="800" fill="url(#ac' + uid + ')">00:10</text>' +
          '</g>' +
          '<rect x="180" y="250" width="280" height="6" rx="3" fill="rgba(255,255,255,.14)"/>' +
          '<rect x="180" y="250" width="170" height="6" rx="3" fill="url(#ac' + uid + ')"/>' +
        '</g>' + watermark();
    },
    molduras: function (uid, p) {
      var t = (p && (p.theme || p.themeInfo)) || {}, a1 = t.a1 || '#8b5cf6', a2 = t.a2 || '#22d3ee';
      return '' +
        camFrame(uid, t, 130, 74, 380, 212) +
        '<rect x="118" y="62" width="404" height="236" rx="20" fill="none" stroke="rgba(255,255,255,.16)" stroke-dasharray="4 8"/>' +
        '<rect x="126" y="70" width="18" height="18" rx="5" fill="' + esc(a1) + '"/>' +
        '<rect x="496" y="70" width="18" height="18" rx="5" fill="' + esc(a2) + '"/>' +
        '<rect x="126" y="276" width="18" height="18" rx="5" fill="' + esc(a2) + '"/>' +
        '<rect x="496" y="276" width="18" height="18" rx="5" fill="' + esc(a1) + '"/>' +
        '<text x="320" y="330" text-anchor="middle" font-size="13" font-weight="700" fill="rgba(255,255,255,.55)" letter-spacing="2">10 MOLDURAS</text>' +
        watermark();
    },
    alertas: function (uid, p) {
      var t = (p && (p.theme || p.themeInfo)) || {};
      return alertBanner(uid, t) +
        '<g transform="translate(150,176)">' +
          '<rect width="340" height="118" rx="18" fill="rgba(8,8,16,.82)" stroke="rgba(255,255,255,.16)"/>' +
          '<circle cx="52" cy="46" r="24" fill="url(#ac' + uid + ')" opacity=".85"/>' +
          '<text x="52" y="54" text-anchor="middle" font-size="22" font-weight="800" fill="#0a0a12">♥</text>' +
          '<rect x="92" y="30" width="176" height="13" rx="6.5" fill="rgba(255,255,255,.88)"/>' +
          '<rect x="92" y="52" width="120" height="10" rx="5" fill="rgba(255,255,255,.4)"/>' +
          '<rect x="24" y="86" width="292" height="8" rx="4" fill="rgba(255,255,255,.12)"/>' +
          '<rect x="24" y="86" width="196" height="8" rx="4" fill="url(#ac' + uid + ')"/>' +
        '</g>' + watermark();
    },
    pacote: function (uid, p) {
      var t = (p && (p.theme || p.themeInfo)) || {};
      return livePill(uid, t) +
        camFrame(uid, t, 24, 74, 210, 128) +
        chatPanel(uid, t) +
        '<g transform="translate(24,220)">' +
          '<rect width="210" height="86" rx="14" fill="rgba(8,8,16,.72)" stroke="url(#ac' + uid + ')" stroke-width="2.5"/>' +
          '<circle cx="34" cy="43" r="16" fill="url(#ac' + uid + ')" opacity=".8"/>' +
          '<rect x="62" y="30" width="118" height="11" rx="5.5" fill="rgba(255,255,255,.85)"/>' +
          '<rect x="62" y="50" width="76" height="9" rx="4.5" fill="rgba(255,255,255,.38)"/>' +
        '</g>' +
        '<g transform="translate(254,74)">' +
          '<rect width="200" height="232" rx="16" fill="rgba(8,8,16,.66)" stroke="rgba(255,255,255,.14)"/>' +
          '<polygon points="100,74 105,96 126,101 105,106 100,128 95,106 74,101 95,96" fill="url(#ac' + uid + ')"/>' +
          '<rect x="30" y="132" width="140" height="11" rx="5.5" fill="rgba(255,255,255,.7)"/>' +
          '<rect x="46" y="154" width="108" height="9" rx="4.5" fill="rgba(255,255,255,.35)"/>' +
        '</g>' + watermark();
    }
  };

  function svgFor(p) {
    p = p || {};
    var uid = 'p' + (++seq);
    var layout = layouts[p.category] || layouts.tema || layouts.tela;
    try {
      return '' +
        '<svg viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Preview de ' + esc(p.name || 'Overlay') + '">' +
          defs(uid, p) +
          bg(uid) +
          layout(uid, p) +
        '</svg>';
    } catch (e) {
      return '' +
        '<svg viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" role="img">' +
          '<rect width="640" height="360" fill="#0c0c14"/>' +
        '</svg>';
    }
  }

  /* ------------------------------------------------------------------
     COMPOSIÇÃO DO TEMA — mapa1920×1080 mostrando onde cada widget
     entra na tela. Widgets são assets: quando existe arquivo, a imagem
     real do widget é desenhada no lugar.
     ------------------------------------------------------------------ */
  function encPath(s) {
    return String(s).split('/').map(encodeURIComponent).join('/');
  }

  function layoutSvg(widgets, assetBase, viewport) {
    var W = 1920, H = 1080;
    var out = '<svg class="layout-svg" viewBox="0 0 ' + W + ' ' + H + '" ' +
      'preserveAspectRatio="xMidYMid meet" role="img" aria-label="Composição do tema em 1920x1080">';

    // 1. Fundo do canvas 1920x1080
    out += '<rect width="' + W + '" height="' + H + '" fill="#07070d"/>';

    // Grid técnico suave
    var gx, gy;
    for (gx = 160; gx < W; gx += 160) {
      out += '<line x1="' + gx + '" y1="0" x2="' + gx + '" y2="' + H + '" stroke="rgba(255,255,255,.05)" stroke-width="1.5"/>';
    }
    for (gy = 108; gy < H; gy += 108) {
      out += '<line x1="0" y1="' + gy + '" x2="' + W + '" y2="' + gy + '" stroke="rgba(255,255,255,.05)" stroke-width="1.5"/>';
    }

    // 2. Corte da Transmissão (Viewport do Jogo / Câmera)
    if (viewport) {
      var scX = Number(viewport.scale_x) > 0 ? Number(viewport.scale_x) : 1.0;
      var scY = Number(viewport.scale_y) > 0 ? Number(viewport.scale_y) : 1.0;
      var offX = Number(viewport.offset_x) || 0.0;
      var offY = Number(viewport.offset_y) || 0.0;

      var vw = W * scX;
      var vh = H * scY;
      var vcx = (W / 2) + (offX * W);
      var vcy = (H / 2) + (offY * H);
      var vx = Math.max(0, Math.min(W - vw, vcx - vw / 2));
      var vy = Math.max(0, Math.min(H - vh, vcy - vh / 2));

      out += '<g class="layout-viewport-cut">';
      out += '<rect x="' + vx + '" y="' + vy + '" width="' + vw + '" height="' + vh + '" fill="rgba(0, 229, 255, 0.05)" stroke="#00E5FF" stroke-width="3" stroke-dasharray="12 8"/>';

      // Cantos técnicos (HUD crosshairs)
      var arm = 28;
      out += '<path d="M ' + (vx + 4) + ' ' + (vy + arm) + ' L ' + (vx + 4) + ' ' + (vy + 4) + ' L ' + (vx + arm) + ' ' + (vy + 4) + '" stroke="#00E5FF" stroke-width="3.5" fill="none"/>';
      out += '<path d="M ' + (vx + vw - arm) + ' ' + (vy + 4) + ' L ' + (vx + vw - 4) + ' ' + (vy + 4) + ' L ' + (vx + vw - 4) + ' ' + (vy + arm) + '" stroke="#00E5FF" stroke-width="3.5" fill="none"/>';
      out += '<path d="M ' + (vx + 4) + ' ' + (vy + vh - arm) + ' L ' + (vx + 4) + ' ' + (vy + vh - 4) + ' L ' + (vx + arm) + ' ' + (vy + vh - 4) + '" stroke="#00E5FF" stroke-width="3.5" fill="none"/>';
      out += '<path d="M ' + (vx + vw - arm) + ' ' + (vy + vh - 4) + ' L ' + (vx + vw - 4) + ' ' + (vy + vh - 4) + ' L ' + (vx + vw - 4) + ' ' + (vy + vh - arm) + '" stroke="#00E5FF" stroke-width="3.5" fill="none"/>';

      var vLabel = 'Transmissão (Jogo / Câmera) · ' + Math.round(vw) + '×' + Math.round(vh) + ' · Escala ' + Math.round(scX * 100) + '%×' + Math.round(scY * 100) + '%';
      var vTw = Math.min(vw - 24, 30 + vLabel.length * 13);
      var vBadgeY = (vy + 40 < H - 20) ? vy + 40 : vy + vh - 20;
      out += '<rect x="' + (vx + 16) + '" y="' + (vBadgeY - 26) + '" width="' + vTw + '" height="34" rx="6" fill="rgba(0, 0, 0, 0.9)" stroke="#00E5FF" stroke-width="1.5"/>';
      out += '<text x="' + (vx + 28) + '" y="' + (vBadgeY - 3) + '" font-size="19" font-weight="800" fill="#00E5FF" letter-spacing="1">' + esc(vLabel) + '</text>';
      out += '</g>';
    }

    // 3. Camadas de Widgets e Banners
    (widgets || []).forEach(function (w) {
      var sc = Number(w.scale) > 0 ? Number(w.scale) : 1;
      var dw = Math.max(40, (Number(w.width) || 100) * sc);
      var dh = Math.max(30, (Number(w.height) || 100) * sc);

      // Suporte preciso a normalized_x / normalized_y e fallback para x / y
      var normX = w.normalized_x !== undefined ? Number(w.normalized_x) : (w.x !== undefined ? Number(w.x) : 0.5);
      var normY = w.normalized_y !== undefined ? Number(w.normalized_y) : (w.y !== undefined ? Number(w.y) : 0.5);
      if (isNaN(normX)) normX = 0.5;
      if (isNaN(normY)) normY = 0.5;

      var cx = normX * W;
      var cy = normY * H;
      var x = cx - dw / 2;
      var y = cy - dh / 2;
      var op = Number(w.opacity);
      if (!(op > 0)) op = 1;

      var isBanner = (w.name || '').toLowerCase().includes('banner') || (w.type === 'image' && (dw >= 1200 || dh >= 800));

      out += '<g opacity="' + op + '">';
      if (isBanner) {
        out += '<rect x="' + x + '" y="' + y + '" width="' + dw + '" height="' + dh + '" fill="rgba(10, 10, 18, 0.95)" stroke="#ffffff" stroke-width="2.5"/>';
      } else {
        out += '<rect x="' + x + '" y="' + y + '" width="' + dw + '" height="' + dh + '" rx="8" fill="rgba(255,255,255,.06)" stroke="rgba(255,255,255,.75)" stroke-width="2.5" stroke-dasharray="14 10"/>';
      }

      var imgHref = w.previewUrl || (assetBase && w.file ? (assetBase + encPath(w.file)) : null);
      if (imgHref && (imgHref.indexOf('https://image.tmdb.org/') === 0 || imgHref.indexOf('http://image.tmdb.org/') === 0)) {
        imgHref = '/api/proxy-image?url=' + encodeURIComponent(imgHref);
      }
      if (imgHref) {
        out += '<image href="' + esc(imgHref) + '" xlink:href="' + esc(imgHref) + '" x="' + (x + 4) + '" y="' + (y + 4) +
          '" width="' + (dw - 8) + '" height="' + (dh - 8) + '" preserveAspectRatio="' + (isBanner ? 'xMidYMid slice' : 'xMidYMid meet') + '" opacity="0.65"/>';
      }

      var label = (w.name || 'Camada') + ' · ' + Math.round(dw) + '×' + Math.round(dh);
      var tw = Math.min(dw - 16, 26 + label.length * 13);
      var ly = (y + 36 < H - 14) ? y + 36 : Math.max(y + 26, y + dh - 14);
      out += '<rect x="' + (x + 8) + '" y="' + (ly - 26) + '" width="' + tw + '" height="32" rx="6" fill="rgba(0,0,0,.9)" stroke="rgba(255,255,255,0.25)"/>';
      out += '<text x="' + (x + 18) + '" y="' + (ly - 4) + '" font-size="19" font-weight="700" fill="#fff">' + esc(label) + '</text>';
      out += '</g>';
    });

    out += '<rect x="2" y="2" width="' + (W - 4) + '" height="' + (H - 4) + '" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="4"/>';
    out += '</svg>';
    return out;
  }

  function animeComposition(p) {
    var uid = 'a' + (++seq);
    var name = esc(p.name || 'ALIVE').toUpperCase();
    var rawBg = p.backdropUrl || p.posterUrl || p.image || '';
    var bgImg = rawBg;
    if (bgImg && (bgImg.indexOf('https://image.tmdb.org/') === 0 || bgImg.indexOf('http://image.tmdb.org/') === 0)) {
      bgImg = '/api/proxy-image?url=' + encodeURIComponent(bgImg);
    }

    return '' +
      '<svg viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Overlay de ' + esc(p.name) + '">' +
        defs(uid, { a1: '#ffffff', a2: '#a1a1aa', bg1: '#070710', bg2: '#030308' }) +
        '<rect width="640" height="360" fill="#07070d"/>' +
        // 1. Área da Transmissão (80% superior = 288px)
        '<rect x="0" y="0" width="640" height="288" fill="rgba(0,229,255,0.02)"/>' +
        (bgImg ? '<image href="' + esc(bgImg) + '" xlink:href="' + esc(bgImg) + '" width="640" height="288" preserveAspectRatio="xMidYMid slice" opacity="0.45"/>' : '') +
        '<rect width="640" height="288" fill="url(#gr' + uid + ')"/>' +
        // Marcadores de corte sutis nos cantos
        '<path d="M 14 30 L 14 14 L 30 14" stroke="#00E5FF" stroke-width="2" fill="none" opacity="0.8"/>' +
        '<path d="M 626 30 L 626 14 L 610 14" stroke="#00E5FF" stroke-width="2" fill="none" opacity="0.8"/>' +
        '<path d="M 14 258 L 14 274 L 30 274" stroke="#00E5FF" stroke-width="2" fill="none" opacity="0.8"/>' +
        '<path d="M 626 258 L 626 274 L 610 274" stroke="#00E5FF" stroke-width="2" fill="none" opacity="0.8"/>' +
        // 2. Banner Oficial (20% inferior = 72px)
        '<g transform="translate(0, 288)">' +
          '<rect width="640" height="72" fill="rgba(6,6,12,0.96)"/>' +
          (bgImg ? '<image href="' + esc(bgImg) + '" xlink:href="' + esc(bgImg) + '" width="640" height="72" preserveAspectRatio="xMidYMid slice" opacity="0.8"/>' : '') +
          '<rect width="640" height="72" fill="linear-gradient(to right, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.88) 100%)"/>' +
          '<line x1="0" y1="0" x2="640" y2="0" stroke="#00E5FF" stroke-width="2.5"/>' +
        '</g>' +
      '</svg>';
  }

  window.AliveArt = {
    /** Retorna o HTML (img ou svg) do preview do produto. */
    html: function (p) {
      try {
        if (p && p.image) {
          return '<img src="' + esc(p.image) + '" alt="Preview de ' + esc(p.name) + '" loading="lazy">';
        }
        return svgFor(p);
      } catch (e) {
        return '<svg viewBox="0 0 640 360" role="img"><rect width="640" height="360" fill="#0d0d16"/></svg>';
      }
    },
    svg: svgFor,
    layoutSvg: layoutSvg,
    animeComposition: animeComposition
  };
})();
