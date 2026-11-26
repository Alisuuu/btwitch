/* ==========================================================================
   ALIVE STORE — controller da página inicial (catálogo)
   Abas: Alive (integração de animes sob demanda) | Comunidade (storage) | Pagos
   ========================================================================== */
(function () {
  'use strict';

  var U = window.ALIVE_UI;
  var A = window.ALIVE_ACTIONS;
  var I = window.ALIVE_I18N;
  function t(k, vars) { return I ? I.t(k, vars) : k; }

  function ALL() { return window.ALIVE_CATALOG; }

  var state = { q: '', tab: 'alive' };
  var grid, searchEl, countEl, modal;
  var searchDebounce = null;

  /* ---------------- Filtros ---------------- */
  function applyFilters() {
    var list = [];

    if (state.tab === 'alive') {
      list = (window.ALIVE_ANIME ? window.ALIVE_ANIME.getItems() : []).slice();
    } else if (state.tab === 'comunidade') {
      list = ALL().filter(function (p) { return !p.price || p.price === 0; });
    } else if (state.tab === 'pagos') {
      return [];
    }

    var q = state.q.trim().toLowerCase();
    if (q && state.tab !== 'alive') {
      list = list.filter(function (p) {
        var author = p.author || (p.themeInfo && p.themeInfo.author) || (p.theme && p.theme.author) || '';
        var hay = (p.name + ' ' + author + ' ' + (p.tagline || '') + ' ' + (p.description || '') + ' ' +
          (p.includes || []).join(' ')).toLowerCase();
        return hay.indexOf(q) !== -1;
      });
    }

    // Deduplicação: por id e por (nome + autor) para preservar criações de autores diferentes
    var seenKeys = {};
    list = list.filter(function (p) {
      var normName = String(p.name || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      var normAuthor = String(p.author || (p.themeInfo && p.themeInfo.author) || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      var idKey = p.id || '';
      var nameAuthorKey = normName + '::' + normAuthor;

      if ((idKey && seenKeys[idKey]) || (normName && seenKeys[nameAuthorKey])) return false;
      if (idKey) seenKeys[idKey] = true;
      if (normName) seenKeys[nameAuthorKey] = true;
      return true;
    });

    list.sort(function (a, b) {
      var d = (b.featured || 0) - (a.featured || 0);
      if (d) return d;
      return String(a.name).localeCompare(String(b.name), I ? I.locale() : 'pt-BR');
    });
    return list;
  }

  /* ---------------- Grid com carregamento sob demanda ----------------
     Só a primeira página de cards é pintada; as demais entram conforme o
     usuário rola, evitando montar dezenas de cards (e animações) de uma vez. */
  var GRID_PAGE_SIZE = 24;
  var gridPage = 1;
  var gridList = [];
  var loadPending = false;

  function cardChunkHtml(items) {
    return items.map(function (p) {
      try { return U.cardHtml(p); } catch (e) { return ''; }
    }).join('');
  }

  function loadMoreGrid() {
    var start = gridPage * GRID_PAGE_SIZE;
    if (start >= gridList.length) return false;
    gridPage++;
    var html = cardChunkHtml(gridList.slice(start, gridPage * GRID_PAGE_SIZE));
    if (!html) return false;

    var tpl = document.createElement('template');
    tpl.innerHTML = html;
    var hasVideo = !!tpl.content.querySelector('video');
    grid.appendChild(tpl.content);

    U.observeReveal(grid);
    if (hasVideo) U.manageVideos(grid);
    return true;
  }

  function gridNearBottom() {
    var doc = document.documentElement;
    var bottom = window.innerHeight + (window.pageYOffset || doc.scrollTop || 0);
    var height = Math.max(doc.scrollHeight, document.body ? document.body.scrollHeight : 0);
    return bottom >= height - 700;
  }

  function maybeLoadMoreGrid() {
    if (!gridList.length) return;
    var guard = 0;
    while (gridNearBottom() && loadMoreGrid() && guard++ < 12) {
      /* continua enchendo a viewport enquanto houver cards */
    }
  }

  function scheduleLoadMoreGrid() {
    if (loadPending) return;
    loadPending = true;
    var run = function () { loadPending = false; maybeLoadMoreGrid(); };
    if (window.requestAnimationFrame) window.requestAnimationFrame(run);
    else setTimeout(run, 16);
  }

  function render() {
    try {
      if (state.tab === 'pagos') {
        grid.innerHTML =
          '<div class="coming-soon-card">' +
            '<span class="coming-soon-pill">' + U.esc(t('coming_soon_pill')) + '</span>' +
            '<h3 class="coming-soon-title">' + U.esc(t('coming_soon_title')) + '</h3>' +
            '<p class="coming-soon-desc">' + U.esc(t('coming_soon_desc')) + '</p>' +
          '</div>';
        countEl.textContent = t('coming_soon_pill');
        return;
      }

      var list = applyFilters();
      var emptyMsg = state.q
        ? t('empty_search')
        : (state.tab === 'comunidade'
            ? t('empty_community')
            : t('empty_anime'));

      gridList = list;
      gridPage = 1;

      grid.innerHTML = list.length
        ? cardChunkHtml(list.slice(0, GRID_PAGE_SIZE))
        : '<div class="empty"><b>' + U.esc(t('empty_title')) + '</b>' + U.esc(emptyMsg) + '</div>';

      countEl.textContent = list.length === 1 ? t('count_one') : t('count_many', { n: list.length });

      U.observeReveal(grid);
      U.manageVideos(grid);
      scheduleLoadMoreGrid();
    } catch (err) {
      if (window.console) console.error('Erro na renderização:', err);
    }
  }

  /* ---------------- Modal de produto ---------------- */
  var lastFocused = null;

  function openProduct(id) {
    var p = null;
    if (state.tab === 'alive' && window.ALIVE_ANIME) {
      p = window.ALIVE_ANIME.getItems().find(function (x) { return x.id === id; });
    }
    if (!p) p = window.ALIVE_HELPERS.byId(id);
    if (!p) return;

    lastFocused = document.activeElement;

    var authorName = p.author || (p.themeInfo && p.themeInfo.author) || (p.theme && p.theme.author) || 'Alive Studio';
    var authorEl = document.getElementById('modalAuthor');
    if (authorEl) {
      authorEl.innerHTML = U.esc(t('card_by')) + '<b>' + U.esc(authorName) + '</b>';
    }
    var badgeEl = document.getElementById('modalBadge');
    if (badgeEl) badgeEl.innerHTML = U.badgeHtml(p);

    var shareBtn = document.getElementById('modalShare');
    if (shareBtn) {
      shareBtn.onclick = function () { A.share(p); };
    }

    if (p.isAnime && window.ALIVE_ANIME) {
      document.getElementById('modalCat').textContent = 'Alive Studio';
      document.getElementById('modalName').textContent = p.name;
      document.getElementById('modalTag').textContent = t('modal_subtitle_anime');
      document.getElementById('modalExtra').innerHTML = '';
      document.getElementById('modalPriceBox').innerHTML =
        '<span class="tag tag-cyan">' + U.esc(t('modal_tag_ondemand')) + '</span>' +
        '<span class="info-chip"><strong>' + U.esc(t('modal_free_pill')) + '</strong></span>' +
        '<span class="info-chip">' + U.esc(t('card_ready')) + '</span>';
      document.getElementById('modalIncludes').innerHTML = '';

      var note = document.getElementById('modalNote');
      if (note) note.style.display = 'none';
      var repBtn = document.getElementById('modalReport');
      if (repBtn) repBtn.style.display = 'none';

      window.ALIVE_ANIME.setupModalForAnime(p);
    } else {
      if (window.ALIVE_ANIME) window.ALIVE_ANIME.resetModalForStandard();

      var artEl = document.getElementById('modalArt');
      var hasComp = !!(p.themeInfo && p.themeInfo.widgets && p.themeInfo.widgets.length && window.AliveArt);
      var stdView = 'composition';

      function renderStandardArt() {
        if (!hasComp) {
          artEl.innerHTML = U.previewHtml(p, { controls: true });
          return;
        }
        var switcher =
          '<div class="modal-art-switcher">' +
            '<button type="button" class="art-switch-btn' + (stdView === 'composition' ? ' active' : '') + '" data-view="composition">' + U.esc(t('anime_btn_composition')) + '</button>' +
            '<button type="button" class="art-switch-btn' + (stdView === 'standby' ? ' active' : '') + '" data-view="standby">' + U.esc(t('anime_btn_standby')) + '</button>' +
          '</div>';
        var body = stdView === 'composition'
          ? window.AliveArt.layoutSvg(p.themeInfo.widgets, p.themeInfo.assetBase, p.themeInfo.viewport)
          : U.previewHtml(p, { controls: true });
        artEl.innerHTML = '<div class="anime-art-wrapper">' + switcher + body + '</div>';
        artEl.querySelectorAll('.art-switch-btn').forEach(function (b) {
          b.addEventListener('click', function (e) {
            e.stopPropagation();
            stdView = b.getAttribute('data-view');
            renderStandardArt();
          });
        });
      }

      renderStandardArt();
      document.getElementById('modalCat').textContent = t('tab_community');
      document.getElementById('modalName').textContent = p.name;
      document.getElementById('modalTag').textContent = p.tagline || t('modal_tag_community_default');
      var extraHtml = '';
      if (p.themeInfo) {
        try { extraHtml = U.themeExtraHtml(p); } catch (e) { if (window.console) console.warn('themeExtraHtml:', e); }
      }
      document.getElementById('modalExtra').innerHTML = extraHtml;
      var wCount = (p.themeInfo && p.themeInfo.widgetCount) || (p.themeInfo && p.themeInfo.widgets && p.themeInfo.widgets.length) || 0;
      document.getElementById('modalPriceBox').innerHTML =
        '<span class="tag tag-cyan">' + U.esc(t('tab_community')) + '</span>' +
        '<span class="info-chip"><strong>' + U.esc(t('modal_free_pill')) + '</strong></span>' +
        (p.version ? '<span class="info-chip">v' + U.esc(p.version) + '</span>' : '') +
        (p.size ? '<span class="info-chip">' + U.esc(p.size) + '</span>' : '') +
        (wCount ? '<span class="info-chip">' + wCount + ' widgets</span>' : '');
      document.getElementById('modalIncludes').innerHTML = '';

      var note = document.getElementById('modalNote');
      if (note) note.style.display = 'none';

      var buyBtn = document.getElementById('modalBuy');
      buyBtn.textContent = t('btn_download');
      buyBtn.className = 'btn btn-lg btn-primary';
      buyBtn.onclick = function () {
        U.isFree(p) ? A.download(p) : A.buy(p, { button: buyBtn });
      };
      var repBtn = document.getElementById('modalReport');
      if (repBtn) {
        repBtn.style.display = '';
        repBtn.onclick = function () { A.openReport(p); };
      }
    }

    modal.classList.add('open');
    modal.dataset.id = p.id;
    document.body.style.overflow = 'hidden';
    document.getElementById('modalClose').focus();
  }

  function closeProduct() {
    modal.classList.remove('open');
    document.body.style.overflow = '';
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  /* ---------------- Init ---------------- */
  function init() {
    grid = document.getElementById('grid');
    searchEl = document.getElementById('search');
    countEl = document.getElementById('resultCount');
    modal = document.getElementById('productModal');
    var clearBtn = document.getElementById('searchClearBtn');
    var closeBtn = document.getElementById('searchCloseBtn');
    var searchBar = document.getElementById('searchBar');
    var searchToggleBtn = document.getElementById('btnSearchToggle');

    function updateClearBtn() {
      if (!clearBtn) return;
      var hasVal = Boolean(searchEl && searchEl.value.trim());
      clearBtn.style.display = hasVal ? 'inline-flex' : 'none';
      if (searchEl) {
        searchEl.style.paddingRight = hasVal ? '72px' : '42px';
      }
    }

    function resetSearch() {
      if (searchEl) searchEl.value = '';
      state.q = '';
      updateClearBtn();

      if (state.tab === 'alive' && window.ALIVE_ANIME) {
        if (window.ALIVE_ANIME.resetToPresets) {
          window.ALIVE_ANIME.resetToPresets();
          render();
        } else {
          window.ALIVE_ANIME.loadPresets().then(render);
        }
      } else {
        render();
      }
    }

    function openSearch() {
      if (!searchBar) return;
      searchBar.classList.add('open');
      searchBar.style.display = 'flex';
      if (searchToggleBtn) {
        searchToggleBtn.classList.add('active');
        searchToggleBtn.setAttribute('aria-expanded', 'true');
      }
      if (searchEl) {
        searchEl.focus();
      }
    }

    function closeSearch() {
      if (!searchBar) return;
      searchBar.classList.remove('open');
      searchBar.style.display = 'none';
      if (searchToggleBtn) {
        searchToggleBtn.classList.remove('active');
        searchToggleBtn.setAttribute('aria-expanded', 'false');
      }
      resetSearch();
    }

    function toggleSearch() {
      if (searchBar && searchBar.classList.contains('open')) {
        closeSearch();
      } else {
        openSearch();
      }
    }

    if (searchToggleBtn) {
      searchToggleBtn.addEventListener('click', function (e) {
        e.preventDefault();
        toggleSearch();
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        closeSearch();
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', function (e) {
        e.preventDefault();
        resetSearch();
        if (searchEl) searchEl.focus();
      });
    }

    if (searchEl) {
      searchEl.addEventListener('search', function () {
        if (!searchEl.value) resetSearch();
      });
      searchEl.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          closeSearch();
        }
      });
    }

    // Abas de navegação
    document.querySelectorAll('.tab-btn[data-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.tab-btn[data-tab]').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        state.tab = btn.dataset.tab;
        state.q = '';
        if (searchEl) searchEl.value = '';
        updateClearBtn();

        if (state.tab === 'alive') {
          if (searchEl) searchEl.placeholder = t('search_placeholder_anime');
          if (window.ALIVE_ANIME) {
            if (window.ALIVE_ANIME.resetToPresets && window.ALIVE_ANIME.resetToPresets()) {
              render();
            } else {
              window.ALIVE_ANIME.loadPresets().then(render);
            }
          } else {
            render();
          }
        } else if (state.tab === 'comunidade') {
          if (searchEl) searchEl.placeholder = t('search_placeholder_community');
          render();
        } else if (state.tab === 'pagos') {
          if (searchEl) searchEl.placeholder = t('search_placeholder_soon');
          render();
        }
      });
    });

    // Busca com suporte à integração de animes
    if (searchEl) {
      searchEl.addEventListener('input', function () {
        state.q = searchEl.value;
        updateClearBtn();

        if (!state.q.trim()) {
          clearTimeout(searchDebounce);
          resetSearch();
          return;
        }

        if (state.tab === 'alive' && window.ALIVE_ANIME) {
          clearTimeout(searchDebounce);
          searchDebounce = setTimeout(function () {
            if (!state.q.trim()) {
              resetSearch();
            } else {
              window.ALIVE_ANIME.search(state.q).then(function (results) {
                window.ALIVE_ANIME.setItems(results);
                render();
              });
            }
          }, 280);
        } else {
          render();
        }
      });
    }

    grid.addEventListener('click', function (e) {
      var rep = e.target.closest('.card-report-btn');
      if (rep) {
        e.preventDefault();
        e.stopPropagation();
        var rid = rep.getAttribute('data-report-id');
        var rp = rid ? window.ALIVE_HELPERS.byId(rid) : null;
        if (rp) A.openReport(rp);
        return;
      }
      var card = e.target.closest('.card');
      if (card) openProduct(card.dataset.id);
    });

    grid.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var card = e.target.closest('.card');
      if (card) { e.preventDefault(); openProduct(card.dataset.id); }
    });

    document.getElementById('modalClose').addEventListener('click', closeProduct);
    modal.querySelector('.modal-backdrop').addEventListener('click', closeProduct);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (modal.classList.contains('open')) closeProduct();
        else A.closeFallback();
      }
    });

    // Temas do storage (Telegram) chegam depois
    document.addEventListener('alive:themes', function (e) {
      if (state.tab === 'comunidade') render();
    });

    // Catálogo popular da aba Alive chegou em background → repinta a lista
    document.addEventListener('alive:anime-more', function () {
      if (state.tab === 'alive' && !state.q) render();
    });

    // Carregamento sob demanda: mais cards conforme o usuário rola
    window.addEventListener('scroll', scheduleLoadMoreGrid, { passive: true });
    window.addEventListener('resize', scheduleLoadMoreGrid, { passive: true });

    // Carga inicial dos animes na aba Alive
    if (window.ALIVE_ANIME) {
      window.ALIVE_ANIME.loadPresets().then(render);
    } else {
      render();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
