/* ==========================================================================
   ALIVE STUDIO COMPOSER — Editor Completo 1920x1080 com TMDB & Cropper
   ========================================================================== */
(function () {
  'use strict';

  const TMDB_API_KEY = '5e5da432e96174227b25086fe8637985';
  const TMDB_BASE = 'https://api.themoviedb.org/3';
  const IMG_BASE = 'https://image.tmdb.org/t/p/';
  const I = window.ALIVE_I18N;
  const t = (k, vars) => (I ? I.t(k, vars) : k);

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  function uuidv4() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function proxyImg(url, thumbSize) {
    if (!url) return '';
    let u = String(url);
    if (thumbSize && !u.endsWith('.svg') && u.includes('/t/p/original/')) {
      u = u.replace('/t/p/original/', `/t/p/${thumbSize}/`);
    }
    if (u.startsWith('https://image.tmdb.org/') || u.startsWith('http://image.tmdb.org/')) {
      return '/api/proxy-image?url=' + encodeURIComponent(u);
    }
    return u;
  }

  function defaultCrop() {
    return { zoom: 100, x: 0, y: 0, dim: 25, radius: 0, flip: false };
  }

  /* ---------------- ESTADO DO COMPOSITOR ---------------- */
  const STATE = {
    themeName: 'Solo Leveling Studio',
    themeAuthor: 'Alive Studio',
    accentColor: '#ffffff',
    preset: 'celular-bottom',
    stageMode: 'composition', // 'composition' | 'standby'
    showGrid: true,
    showViewport: true,
    viewport: { locked: true, offset_x: 0.0, offset_y: -0.1, scale_x: 1.0, scale_y: 0.8 },
    selectedId: 'banner',
    tmdbTitles: [],
    activeTitle: null,
    assets: { backdrops: [], logos: [], posters: [] },
    assetKind: 'backdrops',
    assetLimit: 12,
    assetRenderSig: '',
    draftCrop: null,
    cropDirty: false,
    customSeq: 0,
    layers: [
      {
        id: 'banner',
        kind: 'image',
        role: 'banner',
        name: t('comp_layer_banner'),
        file: 'widget_1_banner.png',
        enabled: true,
        width: 1920,
        height: 216,
        normalized_x: 0.5,
        normalized_y: 0.9,
        scale: 1.0,
        opacity: 1.0,
        imageUrl: '',
        fit: 'cover',
        crop: { zoom: 110, x: 0, y: -15, dim: 30, radius: 0, flip: false }
      },
      {
        id: 'musicqueue',
        kind: 'musicqueue',
        role: 'musicqueue',
        name: t('comp_layer_music'),
        file: '',
        enabled: true,
        width: 640,
        height: 180,
        normalized_x: 0.17,
        normalized_y: 0.915,
        scale: 1.0,
        opacity: 1.0
      },
      {
        id: 'logo',
        kind: 'image',
        role: 'logo',
        name: t('comp_layer_logo'),
        file: 'widget_3_logo.png',
        enabled: true,
        width: 520,
        height: 260,
        normalized_x: 0.14,
        normalized_y: 0.72,
        scale: 0.65,
        opacity: 1.0,
        imageUrl: '',
        fit: 'contain',
        crop: { zoom: 100, x: 0, y: 0, dim: 0, radius: 0, flip: false }
      },
      {
        id: 'background',
        kind: 'background',
        role: 'background',
        name: t('comp_layer_bg'),
        file: 'background.png',
        enabled: false,
        width: 1920,
        height: 1080,
        normalized_x: 0.5,
        normalized_y: 0.5,
        scale: 1.0,
        opacity: 0.45,
        imageUrl: '',
        fit: 'cover',
        crop: { zoom: 100, x: 0, y: 0, dim: 45, radius: 0, flip: false }
      },
      {
        id: 'standby',
        kind: 'standby',
        role: 'standby',
        name: t('comp_layer_standby'),
        file: 'standby.png',
        enabled: true,
        width: 1920,
        height: 1080,
        normalized_x: 0.5,
        normalized_y: 0.5,
        scale: 1.0,
        opacity: 1.0,
        imageUrl: '',
        standbyTitle: t('standby_wait'),
        standbySub: '',
        standbyLogoUrl: '',
        standbyFontSize: 54,
        standbyColor: '#ffffff',
        standbyLogoScale: 65,
        fit: 'cover',
        crop: { zoom: 105, x: 0, y: 0, dim: 40, radius: 0, flip: false }
      }
    ]
  };

  function getLayer(id) {
    return STATE.layers.find((l) => l.id === id) || STATE.layers[0];
  }

  function hasImageCrop(layer) {
    return layer && (layer.kind === 'image' || layer.kind === 'background' || layer.kind === 'standby');
  }

  /* ---------------- TMDB SEARCH & IMAGES ---------------- */
  async function searchTmdb(query) {
    if (!query || !query.trim()) return;
    const strip = $('#tmdbTitleResults');
    if (strip) strip.innerHTML = '<div class="empty-hint" style="padding:8px">Buscando...</div>';

    try {
      const res = await fetch(`${TMDB_BASE}/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query.trim())}&language=pt-BR&include_adult=false`);
      let list = [];
      if (res.ok) {
        const d = await res.json();
        list = (d.results || []).filter((x) => (x.media_type === 'tv' || x.media_type === 'movie') && (x.backdrop_path || x.poster_path));
      }
      if (!list.length) {
        const resEn = await fetch(`${TMDB_BASE}/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query.trim())}&include_adult=false`);
        if (resEn.ok) {
          const dEn = await resEn.json();
          list = (dEn.results || []).filter((x) => (x.media_type === 'tv' || x.media_type === 'movie') && (x.backdrop_path || x.poster_path));
        }
      }

      STATE.tmdbTitles = list.slice(0, 10);
      renderTmdbTitleStrip();
      if (STATE.tmdbTitles.length) {
        await selectTmdbTitle(STATE.tmdbTitles[0]);
      } else {
        $('#tmdbAssetGrid').innerHTML = '<div class="empty-hint">Nenhum resultado encontrado.</div>';
      }
    } catch (e) {
      $('#tmdbAssetGrid').innerHTML = '<div class="empty-hint">Erro ao buscar imagens.</div>';
    }
  }

  function renderTmdbTitleStrip() {
    const strip = $('#tmdbTitleResults');
    if (!strip) return;
    if (!STATE.tmdbTitles.length) {
      strip.innerHTML = '';
      return;
    }
    strip.innerHTML = STATE.tmdbTitles.map((item) => {
      const title = item.name || item.title || item.original_name || 'Título';
      const poster = item.poster_path ? proxyImg(`${IMG_BASE}original${item.poster_path}`, 'w200') : '';
      const active = STATE.activeTitle && STATE.activeTitle.id === item.id ? 'active' : '';
      return `
        <button type="button" class="tmdb-title-pill ${active}" data-id="${item.id}">
          ${poster ? `<img src="${poster}" alt="">` : ''}
          <span>${escapeHtml(title)}</span>
        </button>
      `;
    }).join('');

    strip.querySelectorAll('.tmdb-title-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        const found = STATE.tmdbTitles.find((x) => String(x.id) === btn.dataset.id);
        if (found) selectTmdbTitle(found);
      });
    });
  }

  async function selectTmdbTitle(item) {
    STATE.activeTitle = item;
    renderTmdbTitleStrip();
    $('#tmdbAssetGrid').innerHTML = '<div class="empty-hint">Carregando imagens...</div>';

    const mType = item.media_type === 'movie' ? 'movie' : 'tv';
    let d = null;
    try {
      const res = await fetch(`/api/tmdb/images?type=${encodeURIComponent(mType)}&id=${encodeURIComponent(item.id)}`);
      if (res.ok) d = await res.json();
    } catch (_) {}

    if (!d || (!Array.isArray(d.backdrops) && !Array.isArray(d.logos))) {
      try {
        const res2 = await fetch(`${TMDB_BASE}/${mType}/${item.id}/images?api_key=${TMDB_API_KEY}`);
        if (res2.ok) d = await res2.json();
      } catch (_) {}
    }

    const dedupe = (arr) => {
      const seen = new Set();
      const out = [];
      for (const x of (arr || [])) {
        if (!x || !x.file_path || seen.has(x.file_path)) continue;
        seen.add(x.file_path);
        out.push(`${IMG_BASE}original${x.file_path}`);
      }
      return out;
    };

    const sortedLogos = (d?.logos || []).slice().sort((a, b) => {
      const rank = (x) => (x.iso_639_1 === 'en' ? 0 : x.iso_639_1 === 'pt' ? 1 : !x.iso_639_1 ? 2 : 3);
      return rank(a) - rank(b);
    });

    STATE.assets = {
      backdrops: dedupe(d?.backdrops),
      logos: dedupe(sortedLogos),
      posters: dedupe(d?.posters)
    };

    // Preenche automaticamente camadas vazias no boot para já começar com composição visual rica
    const banner = getLayer('banner');
    const logo = getLayer('logo');
    const standby = getLayer('standby');
    const bg = getLayer('background');
    if (banner && !banner.imageUrl && STATE.assets.backdrops.length) {
      banner.imageUrl = STATE.assets.backdrops[0];
    }
    if (standby && !standby.imageUrl && STATE.assets.backdrops.length) {
      standby.imageUrl = STATE.assets.backdrops[Math.min(1, STATE.assets.backdrops.length - 1)];
    }
    if (bg && !bg.imageUrl && STATE.assets.backdrops.length) {
      bg.imageUrl = STATE.assets.backdrops[Math.min(2, STATE.assets.backdrops.length - 1)];
    }
    if (logo && !logo.imageUrl && STATE.assets.logos.length) {
      logo.imageUrl = STATE.assets.logos[0];
    }

    $('#cntBackdrops').textContent = STATE.assets.backdrops.length;
    $('#cntLogos').textContent = STATE.assets.logos.length;
    $('#cntPosters').textContent = STATE.assets.posters.length;

    STATE.assetLimit = 12;
    STATE.assetRenderSig = '';
    renderAssetGrid();
    renderAll();
  }

  function syncAssetActive() {
    const activeLayer = getLayer(STATE.selectedId);
    const activeUrl = (activeLayer && activeLayer.kind === 'standby' && STATE.assetKind === 'logos')
      ? (activeLayer.standbyLogoUrl || '')
      : (activeLayer?.imageUrl || '');
    $$('#tmdbAssetGrid .asset-tile').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.url === activeUrl);
    });
  }

  function renderAssetGrid() {
    const grid = $('#tmdbAssetGrid');
    const list = STATE.assets[STATE.assetKind] || [];
    const sig = `${STATE.activeTitle?.id || ''}:${STATE.assetKind}:${STATE.assetLimit}:${list.length}`;
    if (sig === STATE.assetRenderSig) {
      syncAssetActive();
      return;
    }
    STATE.assetRenderSig = sig;

    if (!list.length) {
      grid.innerHTML = `<div class="empty-hint">${escapeHtml(t('comp_cat_empty'))}</div>`;
      return;
    }

    const shown = list.slice(0, STATE.assetLimit);
    const cls = STATE.assetKind === 'logos' ? 'is-logo' : (STATE.assetKind === 'posters' ? 'is-poster' : '');
    const loadMoreBtn = list.length > shown.length
      ? `<button type="button" class="btn-load-more" id="btnLoadMoreAssets">${escapeHtml(t('comp_load_more', { n: list.length - shown.length }))}</button>`
      : '';

    grid.innerHTML = shown.map((url) => `
      <button type="button" class="asset-tile ${cls}" data-url="${escapeAttr(url)}">
        <img src="${proxyImg(url, 'w300')}" loading="lazy" decoding="async" alt="">
      </button>
    `).join('') + loadMoreBtn;

    grid.querySelectorAll('.asset-tile').forEach((btn) => {
      btn.addEventListener('click', () => {
        openImageTargetModal(btn.dataset.url);
      });
    });

    const moreBtn = $('#btnLoadMoreAssets');
    if (moreBtn) {
      moreBtn.addEventListener('click', () => {
        STATE.assetLimit += 12;
        renderAssetGrid();
      });
    }

    syncAssetActive();
  }

  function openImageTargetModal(url) {
    const modal = $('#imageTargetModal');
    const preview = $('#targetModalPreviewImg');
    const list = $('#targetModalList');
    if (!modal || !list) return assignImageToSelectedLayer(url);

    if (preview) preview.src = proxyImg(url, 'w500');

    const targets = [];
    STATE.layers.forEach((l) => {
      if (!hasImageCrop(l)) return;
      if (l.kind === 'standby') {
        targets.push({ label: t('comp_target_standby_bg'), sub: '1920×1080', action: () => applyUrlToTarget(l.id, 'bg', url) });
        targets.push({ label: t('comp_target_standby_logo'), sub: t('comp_centered'), action: () => applyUrlToTarget(l.id, 'standbyLogo', url) });
      } else {
        targets.push({ label: l.name, sub: `${Math.round(l.width)}×${Math.round(l.height)}`, action: () => applyUrlToTarget(l.id, 'bg', url) });
      }
    });
    targets.push({
      label: t('comp_target_new'),
      sub: '480×270',
      isNew: true,
      action: () => {
        STATE.customSeq += 1;
        const id = 'custom_' + STATE.customSeq;
        STATE.layers.push({
          id,
          isCustom: true,
          kind: 'image',
          role: 'custom',
          name: `Imagem Extra ${STATE.customSeq}`,
          file: `widget_custom_${STATE.customSeq}.png`,
          enabled: true,
          width: 480,
          height: 270,
          normalized_x: 0.5,
          normalized_y: 0.5,
          scale: 1.0,
          opacity: 1.0,
          imageUrl: url,
          fit: 'cover',
          crop: defaultCrop()
        });
        applyUrlToTarget(id, 'bg', url);
      }
    });

    list.innerHTML = targets.map((t, idx) => `
      <button type="button" class="target-opt-btn ${t.isNew ? 'is-primary' : ''}" data-idx="${idx}">
        <span>${escapeHtml(t.label)}</span>
        <span class="target-opt-sub">${escapeHtml(t.sub)}</span>
      </button>
    `).join('');

    list.querySelectorAll('.target-opt-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.idx);
        modal.hidden = true;
        if (targets[idx]) targets[idx].action();
      });
    });

    modal.hidden = false;
  }

  function applyUrlToTarget(layerId, mode, url) {
    const layer = getLayer(layerId);
    if (!layer) return;
    STATE.selectedId = layerId;
    if (mode === 'standbyLogo') {
      layer.standbyLogoUrl = url;
      STATE.stageMode = 'standby';
    } else {
      layer.imageUrl = url;
      if (layer.id === 'background' && !layer.enabled) layer.enabled = true;
      if (layer.role === 'logo') layer.fit = 'contain';
      STATE.stageMode = layer.kind === 'standby' ? 'standby' : 'composition';
    }
    STATE.draftCrop = Object.assign({ _layerId: layer.id }, layer.crop || defaultCrop());
    STATE.cropDirty = false;
    renderAll();
    const gModal = $('#galleryModal');
    if (gModal) gModal.hidden = true;
    const iModal = $('#inspectorModal');
    if (iModal) {
      iModal.hidden = false;
      renderInspector();
    }
  }

  function assignImageToSelectedLayer(url) {
    let layer = getLayer(STATE.selectedId);
    if (!hasImageCrop(layer)) {
      STATE.selectedId = 'banner';
      layer = getLayer('banner');
    }
    if (layer.kind === 'standby' && STATE.assetKind === 'logos') {
      layer.standbyLogoUrl = url;
      renderAll();
      return;
    }
    layer.imageUrl = url;
    if (layer.id === 'background' && !layer.enabled) {
      layer.enabled = true;
    }
    if (layer.role === 'logo') {
      layer.fit = 'contain';
    }
    renderAll();
  }

  /* ---------------- PRESETS DE VIEWPORT ---------------- */
  function applyPreset(preset) {
    STATE.preset = preset;
    $$('#viewportPresets .pill-btn').forEach((b) => b.classList.toggle('active', b.dataset.preset === preset));

    const banner = getLayer('banner');
    const mq = getLayer('musicqueue');
    const logo = getLayer('logo');

    if (preset === 'celular-bottom') {
      STATE.viewport = { locked: true, offset_x: 0.0, offset_y: -0.1, scale_x: 1.0, scale_y: 0.8 };
      if (banner) Object.assign(banner, { enabled: true, width: 1920, height: 216, normalized_x: 0.5, normalized_y: 0.9, scale: 1 });
      if (mq) Object.assign(mq, { width: 640, height: 180, normalized_x: 0.17, normalized_y: 0.915, scale: 1 });
      if (logo) Object.assign(logo, { normalized_x: 0.14, normalized_y: 0.72, scale: 0.65 });
    } else if (preset === 'celular-top') {
      STATE.viewport = { locked: true, offset_x: 0.0, offset_y: 0.1, scale_x: 1.0, scale_y: 0.8 };
      if (banner) Object.assign(banner, { enabled: true, width: 1920, height: 216, normalized_x: 0.5, normalized_y: 0.1, scale: 1 });
      if (mq) Object.assign(mq, { width: 640, height: 180, normalized_x: 0.17, normalized_y: 0.125, scale: 1 });
      if (logo) Object.assign(logo, { normalized_x: 0.14, normalized_y: 0.28, scale: 0.65 });
    } else if (preset === 'tablet-left') {
      STATE.viewport = { locked: true, offset_x: 0.1, offset_y: 0.0, scale_x: 0.8, scale_y: 1.0 };
      if (banner) Object.assign(banner, { enabled: true, width: 384, height: 1080, normalized_x: 0.1, normalized_y: 0.5, scale: 1 });
      if (mq) Object.assign(mq, { width: 560, height: 276, normalized_x: 0.85, normalized_y: 0.13, scale: 1 });
      if (logo) Object.assign(logo, { normalized_x: 0.88, normalized_y: 0.81, scale: 0.65 });
    } else if (preset === 'tablet-right') {
      STATE.viewport = { locked: true, offset_x: -0.1, offset_y: 0.0, scale_x: 0.8, scale_y: 1.0 };
      if (banner) Object.assign(banner, { enabled: true, width: 384, height: 1080, normalized_x: 0.9, normalized_y: 0.5, scale: 1 });
      if (mq) Object.assign(mq, { width: 560, height: 276, normalized_x: 0.15, normalized_y: 0.13, scale: 1 });
      if (logo) Object.assign(logo, { normalized_x: 0.12, normalized_y: 0.81, scale: 0.65 });
    } else if (preset === 'fullscreen') {
      STATE.viewport = { locked: true, offset_x: 0.0, offset_y: 0.0, scale_x: 1.0, scale_y: 1.0 };
      if (banner) banner.enabled = false;
      if (mq) Object.assign(mq, { width: 640, height: 180, normalized_x: 0.18, normalized_y: 0.9, scale: 1 });
      if (logo) Object.assign(logo, { normalized_x: 0.12, normalized_y: 0.72, scale: 0.6 });
    }

    renderAll();
  }

  /* ---------------- RENDER DO PALCO, CAMADAS E INSPETOR ---------------- */
  function cropTransformCss(crop) {
    const c = crop || defaultCrop();
    const z = (c.zoom || 100) / 100;
    const tx = -(c.x || 0) * 0.45;
    const ty = -(c.y || 0) * 0.45;
    const sx = c.flip ? -z : z;
    return `translate(-50%, -50%) translate(${tx}%, ${ty}%) scale(${sx}, ${z})`;
  }

  function renderCroppedMarkup(layer, thumbSize) {
    if (!layer.imageUrl) return '';
    const c = layer.crop || defaultCrop();
    const isContain = layer.fit === 'contain';
    const dimOp = (c.dim || 0) / 100;
    return `
      <div class="cropped-img-view ${isContain ? 'is-contain' : ''}" style="border-radius:${c.radius || 0}px">
        <img src="${proxyImg(layer.imageUrl, thumbSize)}" alt="" style="transform:${cropTransformCss(c)}">
        ${dimOp > 0 ? `<div class="cropped-img-scrim" style="background:rgba(0,0,0,${dimOp})"></div>` : ''}
      </div>
    `;
  }

  function renderStage() {
    const grid = $('#stageGridOverlay');
    const liveCut = $('#stageLiveCut');
    const bgHost = $('#stageBgLayer');
    const layersHost = $('#stageLayersHost');
    const standbyEl = $('#stageStandbyPreview');

    if (grid) grid.style.display = STATE.showGrid ? 'block' : 'none';

    const bg = getLayer('background');
    if (bgHost) {
      if (bg && bg.enabled && bg.imageUrl) {
        bgHost.style.opacity = String(bg.opacity ?? 1);
        bgHost.innerHTML = renderCroppedMarkup(bg, 'w780');
      } else {
        bgHost.innerHTML = '';
      }
    }

    if (liveCut) {
      liveCut.style.display = STATE.showViewport ? 'block' : 'none';
      liveCut.style.borderColor = STATE.accentColor;
      const vp = STATE.viewport;
      const wPct = (vp.scale_x || 1) * 100;
      const hPct = (vp.scale_y || 1) * 100;
      const cxPct = 50 + (vp.offset_x || 0) * 100;
      const cyPct = 50 + (vp.offset_y || 0) * 100;
      const leftPct = Math.max(0, Math.min(100 - wPct, cxPct - wPct / 2));
      const topPct = Math.max(0, Math.min(100 - hPct, cyPct - hPct / 2));
      liveCut.style.left = leftPct + '%';
      liveCut.style.top = topPct + '%';
      liveCut.style.width = wPct + '%';
      liveCut.style.height = hPct + '%';
      const badge = $('#liveCutBadge');
      if (badge) {
        badge.style.color = STATE.accentColor;
        badge.textContent = `${t('comp_stream_badge')} · ${Math.round(1920 * vp.scale_x)}×${Math.round(1080 * vp.scale_y)}`;
      }
    }

    // Standby Preview mode
    const standby = getLayer('standby');
    if (standbyEl) {
      const showStandby = STATE.stageMode === 'standby';
      standbyEl.hidden = !showStandby;
      if (showStandby && standby) {
        const sBg = $('#standbyPreviewBg');
        if (sBg) sBg.innerHTML = standby.enabled ? renderCroppedMarkup(standby, 'w780') : '';

        const sLogo = $('#standbyPreviewLogo');
        const hasLogo = !!(standby.enabled && standby.standbyLogoUrl);
        if (sLogo) {
          sLogo.hidden = !hasLogo;
          if (hasLogo) {
            sLogo.src = proxyImg(standby.standbyLogoUrl, 'w500');
            const lScale = (standby.standbyLogoScale || 65) / 100;
            sLogo.style.maxWidth = Math.round(52 * lScale) + '%';
            sLogo.style.maxHeight = Math.round(42 * lScale) + '%';
          }
        }

        const titleText = standby.enabled ? (standby.standbyTitle || '') : t('comp_standby_off');
        const subText = standby.enabled ? (standby.standbySub || '') : '';
        const titleEl = $('#standbyPreviewTitle');
        const subEl = $('#standbyPreviewSub');
        const dotEl = $('#standbyPreviewDot');

        if (titleEl) {
          titleEl.textContent = titleText;
          titleEl.hidden = !titleText;
          titleEl.style.color = standby.standbyColor || '#ffffff';
          titleEl.style.fontSize = Math.round((standby.standbyFontSize || 54) * 0.45) + 'px';
        }
        if (subEl) {
          subEl.textContent = subText;
          subEl.hidden = !subText;
        }
        if (dotEl) {
          dotEl.hidden = !standby.enabled || hasLogo || !titleText;
          dotEl.style.background = STATE.accentColor;
          dotEl.style.boxShadow = `0 0 18px ${STATE.accentColor}`;
        }
      }
    }

    // Interactive widgets (all except background and standby)
    const stageWidgets = STATE.layers.filter((l) => l.enabled && (l.kind === 'image' || l.kind === 'musicqueue'));
    layersHost.innerHTML = stageWidgets.map((l) => {
      const wPct = ((l.width * (l.scale || 1)) / 1920) * 100;
      const hPct = ((l.height * (l.scale || 1)) / 1080) * 100;
      const leftPct = (l.normalized_x ?? 0.5) * 100;
      const topPct = (l.normalized_y ?? 0.5) * 100;
      const sel = l.id === STATE.selectedId ? 'selected' : '';
      const mqCls = l.kind === 'musicqueue' ? 'is-musicqueue' : '';

      let accentHtml = '';
      if (l.role === 'banner') {
        if (l.width > l.height) {
          const isBottom = l.normalized_y >= 0.5;
          accentHtml = `<div class="widget-accent-line" style="left:0;right:0;height:3px;${isBottom ? 'top:0' : 'bottom:0'};background:${STATE.accentColor}"></div>`;
        } else {
          const isLeft = l.normalized_x < 0.5;
          accentHtml = `<div class="widget-accent-line" style="top:0;bottom:0;width:3px;${isLeft ? 'right:0' : 'left:0'};background:${STATE.accentColor}"></div>`;
        }
      }

      const content = l.kind === 'musicqueue'
        ? `<div class="widget-tag">${escapeHtml(t('comp_layer_music'))}</div>`
        : `${renderCroppedMarkup(l, 'w500')}${accentHtml}<div class="widget-tag">${escapeHtml(l.name)}</div>`;

      return `
        <div class="stage-widget ${sel} ${mqCls}" data-id="${escapeAttr(l.id)}"
             style="left:${leftPct}%;top:${topPct}%;width:${wPct}%;height:${hPct}%;opacity:${l.opacity ?? 1}">
          ${content}
        </div>
      `;
    }).join('');

    bindStageDrag();
  }

  function renderLayersList() {
    const bar = $('#layerChipsBar');
    if (!bar) return;
    bar.innerHTML = STATE.layers.map((l) => {
      const active = l.id === STATE.selectedId ? 'active' : '';
      const off = !l.enabled ? 'is-off' : '';
      const delHtml = l.isCustom ? `<span class="layer-chip-del" data-del="${escapeAttr(l.id)}" title="Remover camada">×</span>` : '';
      return `
        <button type="button" class="layer-chip ${active} ${off}" data-id="${escapeAttr(l.id)}">
          <span class="layer-chip-dot"></span>
          <span>${escapeHtml(l.name)}</span>
          ${delHtml}
        </button>
      `;
    }).join('');

    bar.querySelectorAll('.layer-chip').forEach((el) => {
      el.addEventListener('click', (e) => {
        const delId = e.target?.dataset?.del;
        if (delId) {
          e.stopPropagation();
          const idx = STATE.layers.findIndex((x) => x.id === delId && x.isCustom);
          if (idx >= 0) {
            STATE.layers.splice(idx, 1);
            if (STATE.selectedId === delId) STATE.selectedId = 'banner';
            renderAll();
          }
          return;
        }
        if (STATE.selectedId === el.dataset.id) {
          const iModal = $('#inspectorModal');
          if (iModal) { iModal.hidden = false; renderInspector(); }
          return;
        }
        STATE.selectedId = el.dataset.id;
        if (getLayer(STATE.selectedId)?.kind === 'standby') {
          STATE.stageMode = 'standby';
        } else if (STATE.stageMode === 'standby') {
          STATE.stageMode = 'composition';
        }
        renderAll();
      });
    });
  }

  function renderInspector() {
    const layer = getLayer(STATE.selectedId);
    if (!layer) return;

    const nameEl = $('#inspectorLayerName');
    if (nameEl) nameEl.textContent = layer.name;
    const badgeEl = $('#targetLayerBadge');
    if (badgeEl) badgeEl.textContent = hasImageCrop(layer) ? layer.name : 'Banner Principal';
    const remEl = $('#btnRemoveLayer');
    if (remEl) remEl.hidden = !layer.isCustom;

    $('#inpLayerEnabled').checked = !!layer.enabled;

    const isImg = hasImageCrop(layer);
    $('#secCropEditor').hidden = !isImg;
    $('#secTransform').hidden = layer.kind === 'background' || layer.kind === 'standby';
    $('#secStandbyText').hidden = layer.kind !== 'standby';

    if (isImg) {
      if (!STATE.draftCrop || STATE.draftCrop._layerId !== layer.id) {
        STATE.draftCrop = Object.assign({ _layerId: layer.id }, layer.crop || defaultCrop());
        STATE.cropDirty = false;
      }
      const c = STATE.draftCrop;
      const imgEl = $('#cropPreviewImg');
      const frameBox = $('#cropFrameBox');
      const hintEl = $('#cropEmptyHint');

      if (layer.imageUrl) {
        imgEl.style.display = 'block';
        imgEl.src = proxyImg(layer.imageUrl, 'w500');
        imgEl.style.transform = c.flip ? 'scaleX(-1)' : 'none';
        hintEl.style.display = 'none';
        if (frameBox) {
          frameBox.style.display = 'block';
          const stageW = $('#cropStage')?.clientWidth || 260;
          const stageH = $('#cropStage')?.clientHeight || 170;
          const ratio = layer.width / Math.max(1, layer.height);
          const zoomFactor = 100 / Math.max(100, c.zoom || 100);
          let fw = stageW * 0.86 * zoomFactor;
          let fh = fw / ratio;
          if (fh > stageH * 0.86 * zoomFactor) {
            fh = stageH * 0.86 * zoomFactor;
            fw = fh * ratio;
          }
          frameBox.style.width = Math.max(24, Math.round(fw)) + 'px';
          frameBox.style.height = Math.max(18, Math.round(fh)) + 'px';
          frameBox.style.left = (50 + (c.x || 0) * 0.35) + '%';
          frameBox.style.top = (50 + (c.y || 0) * 0.35) + '%';
          frameBox.style.borderRadius = Math.min(20, c.radius || 0) + 'px';
        }
      } else {
        imgEl.style.display = 'none';
        if (frameBox) frameBox.style.display = 'none';
        hintEl.style.display = 'flex';
      }

      const applyBtn = $('#btnApplyCrop');
      if (applyBtn) {
        applyBtn.textContent = STATE.cropDirty ? t('comp_apply_crop') : t('comp_applied_crop');
        applyBtn.classList.toggle('is-dirty', !!STATE.cropDirty);
      }

      $('#inpCropZoom').value = c.zoom;
      $('#valCropZoom').textContent = c.zoom + '%';
      $('#inpCropX').value = c.x;
      $('#valCropX').textContent = c.x + '%';
      $('#inpCropY').value = c.y;
      $('#valCropY').textContent = c.y + '%';
      $('#inpImgDim').value = c.dim;
      $('#valImgDim').textContent = c.dim + '%';
      $('#inpImgRadius').value = c.radius;
      $('#valImgRadius').textContent = c.radius + 'px';
      $('#inpImgFlip').checked = !!c.flip;
    }

    if (layer.kind === 'standby') {
      $('#inpStandbyTitle').value = layer.standbyTitle ?? '';
      $('#inpStandbySub').value = layer.standbySub ?? '';
      const fSize = layer.standbyFontSize || 54;
      $('#inpStandbyFontSize').value = fSize;
      $('#valStandbyFontSize').textContent = fSize + 'px';
      $('#inpStandbyColor').value = layer.standbyColor || '#ffffff';
      const lScale = layer.standbyLogoScale || 65;
      $('#inpStandbyLogoScale').value = lScale;
      $('#valStandbyLogoScale').textContent = lScale + '%';
    }

    $('#inpLayerW').value = Math.round(layer.width);
    $('#inpLayerH').value = Math.round(layer.height);
    $('#inpLayerX').value = Number(layer.normalized_x ?? 0.5).toFixed(2);
    $('#inpLayerY').value = Number(layer.normalized_y ?? 0.5).toFixed(2);
    const scPct = Math.round((layer.scale || 1) * 100);
    $('#inpLayerScale').value = scPct;
    $('#valLayerScale').textContent = scPct + '%';
    const opPct = Math.round((layer.opacity ?? 1) * 100);
    $('#inpLayerOpacity').value = opPct;
    $('#valLayerOpacity').textContent = opPct + '%';

    // Viewport controls
    const vp = STATE.viewport;
    $('#inpVpScaleX').value = Math.round(vp.scale_x * 100);
    $('#valVpScaleX').textContent = Math.round(vp.scale_x * 100) + '%';
    $('#inpVpScaleY').value = Math.round(vp.scale_y * 100);
    $('#valVpScaleY').textContent = Math.round(vp.scale_y * 100) + '%';
    $('#inpVpOffX').value = Math.round(vp.offset_x * 100);
    $('#valVpOffX').textContent = Math.round(vp.offset_x * 100) + '%';
    $('#inpVpOffY').value = Math.round(vp.offset_y * 100);
    $('#valVpOffY').textContent = Math.round(vp.offset_y * 100) + '%';
    $('#inpAccentColor').value = STATE.accentColor;

    $$('.smode').forEach((b) => b.classList.toggle('active', b.dataset.mode === STATE.stageMode));
  }

  function renderAll() {
    renderStage();
    renderLayersList();
    renderInspector();
    renderAssetGrid();
  }

  /* ---------------- INTERAÇÕES DE ARRASTO (PALCO & CROP) ---------------- */
  function bindStageDrag() {
    const frame = $('#canvasFrame');
    if (!frame) return;

    $$('.stage-widget').forEach((el) => {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const id = el.dataset.id;
        if (STATE.selectedId !== id) {
          STATE.selectedId = id;
          renderLayersList();
          renderInspector();
          renderAssetGrid();
          $$('.stage-widget').forEach((w) => w.classList.toggle('selected', w.dataset.id === id));
        }

        const layer = getLayer(id);
        if (!layer) return;
        const rect = frame.getBoundingClientRect();
        const startX = e.clientX;
        const startY = e.clientY;
        const origNX = layer.normalized_x ?? 0.5;
        const origNY = layer.normalized_y ?? 0.5;

        const onMove = (ev) => {
          const dx = (ev.clientX - startX) / rect.width;
          const dy = (ev.clientY - startY) / rect.height;
          layer.normalized_x = Math.max(0, Math.min(1, Number((origNX + dx).toFixed(3))));
          layer.normalized_y = Math.max(0, Math.min(1, Number((origNY + dy).toFixed(3))));
          el.style.left = (layer.normalized_x * 100) + '%';
          el.style.top = (layer.normalized_y * 100) + '%';
          $('#inpLayerX').value = layer.normalized_x.toFixed(2);
          $('#inpLayerY').value = layer.normalized_y.toFixed(2);
          const curStat = $('#stageCursorStat');
          if (curStat) curStat.textContent = `${Math.round(layer.normalized_x * 1920)} , ${Math.round(layer.normalized_y * 1080)}`;
        };

        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      });
    });
  }

  function bindCropStageDrag() {
    const cropStage = $('#cropStage');
    if (!cropStage) return;

    cropStage.addEventListener('pointerdown', (e) => {
      const layer = getLayer(STATE.selectedId);
      if (!hasImageCrop(layer) || !layer.imageUrl) return;
      e.preventDefault();
      if (!STATE.draftCrop || STATE.draftCrop._layerId !== layer.id) {
        STATE.draftCrop = Object.assign({ _layerId: layer.id }, layer.crop || defaultCrop());
      }
      const c = STATE.draftCrop;
      const startX = e.clientX;
      const startY = e.clientY;
      const origX = c.x;
      const origY = c.y;

      const onMove = (ev) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        c.x = Math.max(-100, Math.min(100, Math.round(origX + dx * 0.7)));
        c.y = Math.max(-100, Math.min(100, Math.round(origY + dy * 0.7)));
        STATE.cropDirty = true;
        renderInspector();
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  }

  /* ---------------- RENDERIZAÇÃO FINAL EM CANVAS + EXPORTAÇÃO ZIP ---------------- */
  function loadImageSafe(url) {
    return new Promise((resolve) => {
      if (!url) return resolve(null);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = proxyImg(url);
    });
  }

  async function renderCroppedLayerToBlob(layer) {
    const w = Math.max(40, Math.round(layer.width));
    const h = Math.max(30, Math.round(layer.height));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    const img = await loadImageSafe(layer.imageUrl);
    const c = layer.crop || defaultCrop();

    ctx.save();
    if (c.radius > 0) {
      const r = Math.min(c.radius, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.arcTo(w, 0, w, h, r);
      ctx.arcTo(w, h, 0, h, r);
      ctx.arcTo(0, h, 0, 0, r);
      ctx.arcTo(0, 0, w, 0, r);
      ctx.closePath();
      ctx.clip();
    }

    if (layer.role !== 'logo') {
      ctx.fillStyle = '#07070c';
      ctx.fillRect(0, 0, w, h);
    }

    if (img) {
      const z = (c.zoom || 100) / 100;
      const baseScale = layer.fit === 'contain'
        ? Math.min(w / img.width, h / img.height)
        : Math.max(w / img.width, h / img.height);
      const drawW = img.width * baseScale * z;
      const drawH = img.height * baseScale * z;
      const panX = -((c.x || 0) / 100) * w * 0.45;
      const panY = -((c.y || 0) / 100) * h * 0.45;

      ctx.save();
      ctx.translate(w / 2 + panX, h / 2 + panY);
      if (c.flip) ctx.scale(-1, 1);
      ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();
    }

    if (c.dim > 0) {
      ctx.fillStyle = `rgba(0, 0, 0, ${(c.dim / 100).toFixed(2)})`;
      ctx.fillRect(0, 0, w, h);
    }

    if (layer.role === 'banner') {
      ctx.fillStyle = STATE.accentColor || '#ffffff';
      if (w > h) {
        const yLine = (layer.normalized_y ?? 0.9) >= 0.5 ? 0 : h - 4;
        ctx.fillRect(0, yLine, w, 4);
      } else {
        const xLine = (layer.normalized_x ?? 0.1) < 0.5 ? w - 4 : 0;
        ctx.fillRect(xLine, 0, 4, h);
      }
    }

    if (layer.kind === 'standby') {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, 'rgba(7,7,10,0.35)');
      grad.addColorStop(1, 'rgba(7,7,10,0.88)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      let logoImg = null;
      if (layer.standbyLogoUrl) {
        logoImg = await loadImageSafe(layer.standbyLogoUrl);
      }

      const titleStr = (layer.standbyTitle || '').trim();
      const subStr = (layer.standbySub || '').trim();
      const fSize = layer.standbyFontSize || 54;
      const tColor = layer.standbyColor || '#ffffff';

      if (logoImg) {
        const lScale = (layer.standbyLogoScale || 65) / 100;
        const maxW = w * 0.45 * lScale;
        const maxH = h * 0.36 * lScale;
        const ratio = Math.min(maxW / logoImg.width, maxH / logoImg.height);
        const dw = logoImg.width * ratio;
        const dh = logoImg.height * ratio;
        const logoY = (titleStr || subStr) ? (h * 0.38 - dh / 2) : (h / 2 - dh / 2);
        ctx.drawImage(logoImg, (w - dw) / 2, logoY, dw, dh);
      } else if (titleStr) {
        ctx.fillStyle = STATE.accentColor || '#ffffff';
        ctx.beginPath();
        ctx.arc(w / 2, h / 2 - 64, 9, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const titleY = logoImg ? h * 0.65 : h / 2;
      if (titleStr) {
        ctx.fillStyle = tColor;
        ctx.font = `800 ${fSize}px Sora, Inter, sans-serif`;
        ctx.fillText(titleStr, w / 2, titleY);
      }

      if (subStr) {
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.font = '500 28px Inter, sans-serif';
        ctx.fillText(subStr, w / 2, titleStr ? (titleY + fSize * 1.15) : titleY);
      }
    }

    ctx.restore();

    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  }

  async function renderStandbyVideoOrImage(layer) {
    const w = 1280;
    const h = 720;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    const bgImg = layer.imageUrl ? await loadImageSafe(layer.imageUrl) : null;
    const logoImg = layer.standbyLogoUrl ? await loadImageSafe(layer.standbyLogoUrl) : null;
    const crop = layer.crop || defaultCrop();
    const titleStr = (layer.standbyTitle || '').trim();
    const subStr = (layer.standbySub || '').trim();
    const fSize = Math.round((layer.standbyFontSize || 54) * (w / 1920));
    const tColor = layer.standbyColor || '#ffffff';
    const lScale = (layer.standbyLogoScale || 65) / 100;

    const drawFrame = (progress) => {
      const pulse = 0.5 + 0.5 * Math.sin(progress * Math.PI * 2);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#07070a';
      ctx.fillRect(0, 0, w, h);

      if (bgImg) {
        ctx.save();
        const cover = Math.max(w / bgImg.width, h / bgImg.height);
        const breath = 1 + 0.025 * pulse;
        const dw = bgImg.width * cover * (crop.zoom || 1) * breath;
        const dh = bgImg.height * cover * (crop.zoom || 1) * breath;
        const cx = w / 2 + ((crop.x || 50) - 50) / 100 * w * 0.5;
        const cy = h / 2 + ((crop.y || 50) - 50) / 100 * h * 0.5;
        ctx.translate(cx, cy);
        if (crop.flip) ctx.scale(-1, 1);
        ctx.drawImage(bgImg, -dw / 2, -dh / 2, dw, dh);
        ctx.restore();
      }

      if ((crop.dim || 0) > 0) {
        ctx.fillStyle = `rgba(0,0,0,${Math.min(0.85, (crop.dim || 0) / 100)})`;
        ctx.fillRect(0, 0, w, h);
      }

      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, 'rgba(7,7,10,0.35)');
      grad.addColorStop(1, 'rgba(7,7,10,0.88)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      if (logoImg) {
        const maxW = w * 0.45 * lScale;
        const maxH = h * 0.36 * lScale;
        const ratio = Math.min(maxW / logoImg.width, maxH / logoImg.height);
        const dw = logoImg.width * ratio;
        const dh = logoImg.height * ratio;
        const logoY = (titleStr || subStr) ? (h * 0.38 - dh / 2) : (h / 2 - dh / 2);
        ctx.save();
        ctx.globalAlpha = 0.9 + 0.1 * pulse;
        ctx.drawImage(logoImg, (w - dw) / 2, logoY, dw, dh);
        ctx.restore();
      } else if (titleStr) {
        ctx.save();
        ctx.fillStyle = STATE.accentColor || '#ffffff';
        ctx.shadowColor = STATE.accentColor || '#ffffff';
        ctx.shadowBlur = 10 + 14 * pulse;
        ctx.beginPath();
        ctx.arc(w / 2, h / 2 - 44, 6 + 2 * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const titleY = logoImg ? h * 0.65 : h / 2;
      if (titleStr) {
        ctx.fillStyle = tColor;
        ctx.font = `800 ${fSize}px Sora, Inter, sans-serif`;
        ctx.fillText(titleStr, w / 2, titleY);
      }
      if (subStr) {
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.font = '500 20px Inter, sans-serif';
        ctx.fillText(subStr, w / 2, titleStr ? (titleY + fSize * 1.15) : titleY);
      }
    };

    drawFrame(0);

    if (typeof MediaRecorder !== 'undefined' && typeof canvas.captureStream === 'function') {
      const candidateMimes = [
        'video/mp4;codecs=avc1',
        'video/mp4',
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm'
      ];
      const mime = candidateMimes.find((m) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || '';
      if (mime) {
        try {
          const stream = canvas.captureStream(25);
          const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2500000 });
          const chunks = [];
          recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) chunks.push(e.data);
          };
          const recorded = await new Promise((resolve) => {
            let finished = false;
            const finish = () => {
              if (finished) return;
              finished = true;
              resolve(chunks.length > 0 ? { blob: new Blob(chunks, { type: mime }), isVideo: true } : null);
            };
            recorder.onstop = finish;
            recorder.onerror = () => finish();
            recorder.start();
            let frame = 0;
            const totalFrames = 30;
            const interval = setInterval(() => {
              frame++;
              drawFrame(frame / totalFrames);
              if (frame >= totalFrames) {
                clearInterval(interval);
                try { recorder.stop(); } catch (e) { finish(); }
              }
            }, 40);
            setTimeout(() => {
              clearInterval(interval);
              try { if (recorder.state === 'recording') recorder.stop(); } catch (e) {}
              finish();
            }, 2500);
          });
          if (recorded && recorded.blob && recorded.blob.size > 1000) {
            return recorded;
          }
        } catch (recErr) {
          console.warn('MediaRecorder standby falhou:', recErr);
        }
      }
    }

    const imgBlob = await renderCroppedLayerToBlob(layer);
    return imgBlob ? { blob: imgBlob, isVideo: false } : null;
  }

  async function exportThemeZip() {
    if (!window.JSZip) return alert('JSZip não carregado.');
    const btn = $('#btnExportZip');
    const status = $('#exportStatusText');
    btn.disabled = true;
    status.textContent = 'Renderizando imagens recortadas...';

    try {
      const zip = new window.JSZip();
      const widgets = [];
      let previewFile = '';

      for (const layer of STATE.layers) {
        if (!layer.enabled) continue;

        if (layer.kind === 'musicqueue') {
          widgets.push({
            name: layer.name,
            type: 'musicqueue',
            file: '',
            width: Math.round(layer.width),
            height: Math.round(layer.height),
            normalized_x: Number((layer.normalized_x ?? 0.5).toFixed(4)),
            normalized_y: Number((layer.normalized_y ?? 0.5).toFixed(4)),
            scale: Number((layer.scale ?? 1).toFixed(3)),
            opacity: Number((layer.opacity ?? 1).toFixed(3)),
            position_index: 6
          });
          continue;
        }

        if (layer.kind === 'image' && layer.imageUrl) {
          const blob = await renderCroppedLayerToBlob(layer);
          if (blob) {
            zip.file(layer.file, blob);
            if (layer.role === 'banner' || !previewFile) previewFile = layer.file;
            widgets.push({
              name: layer.name,
              type: 'image',
              file: layer.file,
              width: Math.round(layer.width),
              height: Math.round(layer.height),
              normalized_x: Number((layer.normalized_x ?? 0.5).toFixed(4)),
              normalized_y: Number((layer.normalized_y ?? 0.5).toFixed(4)),
              scale: Number((layer.scale ?? 1).toFixed(3)),
              opacity: Number((layer.opacity ?? 1).toFixed(3)),
              position_index: 6
            });
          }
        }
      }

      const bg = getLayer('background');
      let bgObj = { enabled: false, file: '', fit_mode: 'crop', opacity: 1.0 };
      if (bg && bg.enabled && bg.imageUrl) {
        const bgBlob = await renderCroppedLayerToBlob(bg);
        if (bgBlob) {
          zip.file('background.png', bgBlob);
          if (!previewFile) previewFile = 'background.png';
          bgObj = { enabled: true, file: 'background.png', fit_mode: 'crop', opacity: Number((bg.opacity ?? 1).toFixed(2)) };
        }
      }

      const standby = getLayer('standby');
      let standbyObj = { enabled: false, file: '', title: '', subtitle: '', type: '' };
      if (standby && standby.enabled) {
        const stRes = await renderStandbyVideoOrImage(standby);
        if (stRes && stRes.blob) {
          const stFile = stRes.isVideo ? 'standby.mp4' : 'standby.png';
          zip.file(stFile, stRes.blob);
          if (!previewFile) {
            const stPreview = stRes.isVideo ? await renderCroppedLayerToBlob(standby) : stRes.blob;
            if (stPreview) {
              zip.file('preview.png', stPreview);
              previewFile = 'preview.png';
            }
          }
          standbyObj = {
            enabled: true,
            file: stFile,
            title: standby.standbyTitle || 'Aguarde um momento',
            subtitle: standby.standbySub || '',
            type: stRes.isVideo ? 'video' : 'image'
          };
        }
      }

      const themeJson = {
        id: uuidv4(),
        name: STATE.themeName || 'Tema Alive Studio',
        description: `Criado no Alive Studio Composer (${STATE.preset}).`,
        author: STATE.themeAuthor || 'Alive Studio',
        version: '1.0',
        preview_image: previewFile || 'standby.png',
        target_profile: 'custom',
        standby: standbyObj,
        background: bgObj,
        frame: {
          border_color: STATE.accentColor,
          border_width: 3.0,
          corner_radius: 0.0,
          enabled: false,
          file: '',
          fit_mode: 'stretch',
          glow: false,
          opacity: 1.0
        },
        viewport: STATE.viewport,
        widgets: widgets
      };

      zip.file('theme.json', JSON.stringify(themeJson, null, 2));
      status.textContent = 'Compactando .zip...';
      const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });

      const slug = (STATE.themeName || 'tema_alive').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24) || 'tema';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(zipBlob);
      a.download = `${slug}_alive.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      status.textContent = `Exportado (${widgets.length} widgets)`;
    } catch (err) {
      console.error(err);
      status.textContent = 'Erro ao exportar';
      alert('Erro ao gerar .zip: ' + err.message);
    } finally {
      btn.disabled = false;
    }
  }

  /* ---------------- EVENTOS E INICIALIZAÇÃO ---------------- */
  function initBindings() {
    $('#themeNameInput').addEventListener('input', (e) => {
      STATE.themeName = e.target.value;
      const topTitle = $('#topbarThemeTitle');
      if (topTitle) topTitle.textContent = STATE.themeName || 'Alive Studio';
    });
    $('#themeAuthorInput').addEventListener('input', (e) => { STATE.themeAuthor = e.target.value; });

    const openModal = (id) => {
      const m = $('#' + id);
      if (m) m.hidden = false;
      if (id === 'inspectorModal') renderInspector();
    };
    const closeModal = (id) => {
      const m = $('#' + id);
      if (m) m.hidden = true;
    };

    $('#btnOpenGallery')?.addEventListener('click', () => openModal('galleryModal'));
    $('#btnOpenInspector')?.addEventListener('click', () => openModal('inspectorModal'));
    $('#btnOpenPresets')?.addEventListener('click', () => openModal('presetsModal'));
    $('#btnPickImageForLayer')?.addEventListener('click', () => {
      closeModal('inspectorModal');
      openModal('galleryModal');
    });

    $$('[data-close-modal]').forEach((el) => {
      el.addEventListener('click', () => closeModal(el.dataset.closeModal));
    });

    $('#tmdbSearchForm').addEventListener('submit', (e) => {
      e.preventDefault();
      searchTmdb($('#tmdbQueryInput').value);
    });

    $$('.qchip').forEach((chip) => {
      chip.addEventListener('click', () => {
        $('#tmdbQueryInput').value = chip.dataset.q;
        searchTmdb(chip.dataset.q);
      });
    });

    $$('#assetKindTabs .akind').forEach((btn) => {
      btn.addEventListener('click', () => {
        STATE.assetKind = btn.dataset.kind;
        STATE.assetLimit = 12;
        $$('#assetKindTabs .akind').forEach((b) => b.classList.toggle('active', b === btn));
        renderAssetGrid();
      });
    });

    $('#localImgInput').addEventListener('change', (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => openImageTargetModal(reader.result);
      reader.readAsDataURL(f);
      e.target.value = '';
    });

    const closeTargetModal = () => { const m = $('#imageTargetModal'); if (m) m.hidden = true; };
    $('#btnCloseTargetModal')?.addEventListener('click', closeTargetModal);
    $('#imageTargetBackdrop')?.addEventListener('click', closeTargetModal);

    $$('#viewportPresets .pill-btn').forEach((btn) => {
      btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
    });

    $$('.smode').forEach((btn) => {
      btn.addEventListener('click', () => {
        STATE.stageMode = btn.dataset.mode;
        if (STATE.stageMode === 'standby') {
          STATE.selectedId = 'standby';
        } else if (STATE.selectedId === 'standby') {
          STATE.selectedId = 'banner';
        }
        renderAll();
      });
    });

    $('#chkShowGrid').addEventListener('change', (e) => { STATE.showGrid = e.target.checked; renderStage(); });
    $('#chkShowViewport').addEventListener('change', (e) => { STATE.showViewport = e.target.checked; renderStage(); });

    $('#btnAddImageLayer').addEventListener('click', () => {
      STATE.customSeq += 1;
      const id = 'custom_' + STATE.customSeq;
      STATE.layers.push({
        id,
        isCustom: true,
        kind: 'image',
        role: 'custom',
        name: `Imagem Extra ${STATE.customSeq}`,
        file: `widget_custom_${STATE.customSeq}.png`,
        enabled: true,
        width: 480,
        height: 270,
        normalized_x: 0.82,
        normalized_y: 0.72,
        scale: 1.0,
        opacity: 1.0,
        imageUrl: STATE.assets.backdrops[0] || '',
        fit: 'cover',
        crop: defaultCrop()
      });
      STATE.selectedId = id;
      STATE.stageMode = 'composition';
      renderAll();
    });

    $('#btnRemoveLayer').addEventListener('click', () => {
      const idx = STATE.layers.findIndex((l) => l.id === STATE.selectedId && l.isCustom);
      if (idx < 0) return;
      STATE.layers.splice(idx, 1);
      STATE.selectedId = 'banner';
      renderAll();
    });

    $('#inpLayerEnabled').addEventListener('change', (e) => {
      const l = getLayer(STATE.selectedId);
      if (l) { l.enabled = e.target.checked; renderStage(); renderLayersList(); }
    });

    $('#btnClearLayerImage').addEventListener('click', () => {
      const l = getLayer(STATE.selectedId);
      if (!hasImageCrop(l)) return;
      l.imageUrl = '';
      if (l.id === 'background') l.enabled = false;
      STATE.draftCrop = Object.assign({ _layerId: l.id }, defaultCrop());
      STATE.cropDirty = false;
      renderAll();
    });

    $('#btnResetCrop').addEventListener('click', () => {
      const l = getLayer(STATE.selectedId);
      if (hasImageCrop(l)) {
        STATE.draftCrop = Object.assign({ _layerId: l.id }, defaultCrop());
        STATE.cropDirty = true;
        renderInspector();
      }
    });

    $('#btnApplyCrop').addEventListener('click', () => {
      const l = getLayer(STATE.selectedId);
      if (!hasImageCrop(l) || !STATE.draftCrop) return;
      const { _layerId, ...applied } = STATE.draftCrop;
      l.crop = applied;
      STATE.cropDirty = false;
      renderAll();
    });

    const bindCropSlider = (id, key) => {
      $(id).addEventListener('input', (e) => {
        const l = getLayer(STATE.selectedId);
        if (!hasImageCrop(l)) return;
        if (!STATE.draftCrop || STATE.draftCrop._layerId !== l.id) {
          STATE.draftCrop = Object.assign({ _layerId: l.id }, l.crop || defaultCrop());
        }
        STATE.draftCrop[key] = Number(e.target.value);
        STATE.cropDirty = true;
        renderInspector();
      });
    };
    bindCropSlider('#inpCropZoom', 'zoom');
    bindCropSlider('#inpCropX', 'x');
    bindCropSlider('#inpCropY', 'y');
    bindCropSlider('#inpImgDim', 'dim');
    bindCropSlider('#inpImgRadius', 'radius');

    $('#inpImgFlip').addEventListener('change', (e) => {
      const l = getLayer(STATE.selectedId);
      if (!hasImageCrop(l)) return;
      if (!STATE.draftCrop || STATE.draftCrop._layerId !== l.id) {
        STATE.draftCrop = Object.assign({ _layerId: l.id }, l.crop || defaultCrop());
      }
      STATE.draftCrop.flip = e.target.checked;
      STATE.cropDirty = true;
      renderInspector();
    });

    const bindNum = (id, prop, min, max) => {
      $(id).addEventListener('input', (e) => {
        const l = getLayer(STATE.selectedId);
        if (!l) return;
        const v = Number(e.target.value);
        if (!isNaN(v)) {
          l[prop] = Math.max(min, Math.min(max, v));
          renderStage();
          renderLayersList();
        }
      });
    };
    bindNum('#inpLayerW', 'width', 40, 1920);
    bindNum('#inpLayerH', 'height', 30, 1080);
    bindNum('#inpLayerX', 'normalized_x', 0, 1);
    bindNum('#inpLayerY', 'normalized_y', 0, 1);

    $('#inpLayerScale').addEventListener('input', (e) => {
      const l = getLayer(STATE.selectedId);
      if (l) { l.scale = Number(e.target.value) / 100; renderStage(); renderInspector(); renderLayersList(); }
    });
    $('#inpLayerOpacity').addEventListener('input', (e) => {
      const l = getLayer(STATE.selectedId);
      if (l) { l.opacity = Number(e.target.value) / 100; renderStage(); renderInspector(); }
    });

    $('#inpStandbyTitle').addEventListener('input', (e) => {
      const l = getLayer('standby');
      if (l) { l.standbyTitle = e.target.value; renderStage(); }
    });
    $('#inpStandbySub').addEventListener('input', (e) => {
      const l = getLayer('standby');
      if (l) { l.standbySub = e.target.value; renderStage(); }
    });
    $('#inpStandbyFontSize').addEventListener('input', (e) => {
      const l = getLayer('standby');
      if (l) { l.standbyFontSize = Number(e.target.value); renderStage(); renderInspector(); }
    });
    $('#inpStandbyColor').addEventListener('input', (e) => {
      const l = getLayer('standby');
      if (l) { l.standbyColor = e.target.value; renderStage(); }
    });
    $('#inpStandbyLogoScale').addEventListener('input', (e) => {
      const l = getLayer('standby');
      if (l) { l.standbyLogoScale = Number(e.target.value); renderStage(); renderInspector(); }
    });
    $('#btnStandbyUseThemeLogo').addEventListener('click', () => {
      const st = getLayer('standby');
      const lg = getLayer('logo');
      const url = (lg && lg.imageUrl) || STATE.assets.logos[0] || '';
      if (st && url) {
        st.standbyLogoUrl = url;
        renderAll();
      }
    });
    $('#btnStandbyClearLogo').addEventListener('click', () => {
      const st = getLayer('standby');
      if (st) { st.standbyLogoUrl = ''; renderAll(); }
    });
    $('#inpStandbyLogoFile').addEventListener('change', (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        const st = getLayer('standby');
        if (st) { st.standbyLogoUrl = reader.result; renderAll(); }
      };
      reader.readAsDataURL(f);
      e.target.value = '';
    });

    const bindVp = (id, key) => {
      $(id).addEventListener('input', (e) => {
        STATE.viewport[key] = Number(e.target.value) / 100;
        renderStage();
        renderInspector();
      });
    };
    bindVp('#inpVpScaleX', 'scale_x');
    bindVp('#inpVpScaleY', 'scale_y');
    bindVp('#inpVpOffX', 'offset_x');
    bindVp('#inpVpOffY', 'offset_y');

    $('#inpAccentColor').addEventListener('input', (e) => {
      STATE.accentColor = e.target.value;
      renderStage();
    });

    $('#btnExportZip').addEventListener('click', () => {
      $('#themeNameInput').value = STATE.themeName || '';
      $('#themeAuthorInput').value = STATE.themeAuthor || '';
      openModal('exportModal');
    });
    $('#btnConfirmExport').addEventListener('click', async () => {
      closeModal('exportModal');
      await exportThemeZip();
    });

    bindCropStageDrag();
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, '&quot;');
  }

  async function loadInitialFromUrl() {
    const qs = new URLSearchParams(window.location.search);
    const tmdbType = qs.get('tmdbType');
    const tmdbId = qs.get('tmdbId');
    const themeId = qs.get('themeId');

    if (tmdbType && tmdbId) {
      const name = qs.get('name') || 'Tema Alive';
      STATE.themeName = name;
      $('#themeNameInput').value = name;
      const topTitle = $('#topbarThemeTitle');
      if (topTitle) topTitle.textContent = name;
      $('#tmdbQueryInput').value = name;

      const dev = qs.get('device') || 'celular';
      const pos = qs.get('pos') || 'bottom';
      const preset = pos === 'none' ? 'fullscreen' : `${dev}-${pos}`;
      if (['celular-bottom', 'celular-top', 'tablet-left', 'tablet-right', 'fullscreen'].includes(preset)) {
        applyPreset(preset);
      }

      const bd = qs.get('backdrop');
      const lg = qs.get('logo');
      const st = qs.get('standby');
      if (bd) getLayer('banner').imageUrl = bd;
      if (lg) getLayer('logo').imageUrl = lg;
      if (st || bd) getLayer('standby').imageUrl = st || bd;

      await selectTmdbTitle({ id: tmdbId, media_type: tmdbType, name });
      return;
    }

    if (themeId) {
      try {
        const res = await fetch('/api/themes');
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : (data.themes || []);
          const found = list.find((x) => String(x.id) === String(themeId));
          if (found) {
            STATE.themeName = found.name || 'Tema Comunidade';
            STATE.themeAuthor = found.author || 'Comunidade';
            $('#themeNameInput').value = STATE.themeName;
            $('#themeAuthorInput').value = STATE.themeAuthor;

            const ti = found.themeInfo || {};
            if (ti.viewport) STATE.viewport = Object.assign({}, STATE.viewport, ti.viewport);
            if (ti.frame && ti.frame.border_color) STATE.accentColor = ti.frame.border_color;

            const assetBase = ti.assetBase || '';
            const resolveAsset = (file, fallback) => fallback || (file ? (assetBase + file) : '');

            if (ti.standby) {
              const stLayer = getLayer('standby');
              stLayer.enabled = !!ti.standby.enabled;
              stLayer.standbyTitle = ti.standby.title || 'Aguarde um momento';
              stLayer.standbySub = ti.standby.subtitle || '';
              if (ti.standby.file && !ti.standby.file.endsWith('.mp4')) {
                stLayer.imageUrl = resolveAsset(ti.standby.file, '');
              }
            }

            const widgets = Array.isArray(ti.widgets) ? ti.widgets : [];
            const bannerW = widgets.find((w) => (w.name || '').toLowerCase().includes('banner'));
            const mqW = widgets.find((w) => w.type === 'musicqueue');
            const logoW = widgets.find((w) => w.type === 'image' && w !== bannerW);

            if (bannerW) {
              Object.assign(getLayer('banner'), {
                enabled: true,
                width: bannerW.width || 1920,
                height: bannerW.height || 216,
                normalized_x: bannerW.normalized_x ?? bannerW.x ?? 0.5,
                normalized_y: bannerW.normalized_y ?? bannerW.y ?? 0.9,
                scale: bannerW.scale ?? 1,
                opacity: bannerW.opacity ?? 1,
                imageUrl: resolveAsset(bannerW.file, bannerW.previewUrl)
              });
            } else {
              getLayer('banner').enabled = false;
            }

            if (mqW) {
              Object.assign(getLayer('musicqueue'), {
                enabled: true,
                width: mqW.width || 640,
                height: mqW.height || 180,
                normalized_x: mqW.normalized_x ?? mqW.x ?? 0.17,
                normalized_y: mqW.normalized_y ?? mqW.y ?? 0.915,
                scale: mqW.scale ?? 1,
                opacity: mqW.opacity ?? 1
              });
            }

            if (logoW) {
              Object.assign(getLayer('logo'), {
                enabled: true,
                name: logoW.name || 'Logo',
                width: logoW.width || 520,
                height: logoW.height || 260,
                normalized_x: logoW.normalized_x ?? logoW.x ?? 0.14,
                normalized_y: logoW.normalized_y ?? logoW.y ?? 0.72,
                scale: logoW.scale ?? 0.65,
                opacity: logoW.opacity ?? 1,
                imageUrl: resolveAsset(logoW.file, logoW.previewUrl)
              });
            }

            renderAll();
            searchTmdb('Solo Leveling');
            return;
          }
        }
      } catch (e) {
        console.warn('Falha ao carregar tema da comunidade no compositor:', e);
      }
    }

    searchTmdb('Solo Leveling');
  }

  document.addEventListener('DOMContentLoaded', () => {
    const backLink = $('.back-link');
    if (backLink && I && I.lang) {
      backLink.href = './?lang=' + encodeURIComponent(I.lang);
    }
    initBindings();
    renderAll();
    loadInitialFromUrl();
  });
})();
