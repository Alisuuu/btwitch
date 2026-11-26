/* ==========================================================================
   ALIVE STORE — controller da página inicial (catálogo)
   Abas: Alive (integração de animes sob demanda) | Comunidade (storage) | Pagos
   ========================================================================== */
(function () {
  'use strict';

  var U = window.ALIVE_UI;
  var A = window.ALIVE_ACTIONS;

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
      return String(a.name).localeCompare(String(b.name), 'pt-BR');
    });
    return list;
  }

  function render() {
    try {
      if (state.tab === 'pagos') {
        grid.innerHTML =
          '<div class="coming-soon-card">' +
            '<span class="coming-soon-pill">Em breve</span>' +
            '<h3 class="coming-soon-title">Overlays Pagos em Breve</h3>' +
            '<p class="coming-soon-desc">A loja de temas e overlays exclusivos está sendo preparada para as próximas atualizações.</p>' +
          '</div>';
        countEl.textContent = 'Em breve';
        return;
      }

      var list = applyFilters();
      var emptyMsg = state.q
        ? 'Tente outro termo de busca.'
        : (state.tab === 'comunidade'
            ? 'Assim que um tema for publicado, ele aparece aqui.'
            : 'Carregando animes…');

      grid.innerHTML = list.length
        ? list.map(function (p) {
            try { return U.cardHtml(p); } catch (e) { return ''; }
          }).join('')
        : '<div class="empty"><b>Nenhum produto encontrado</b>' + emptyMsg + '</div>';

      countEl.textContent = list.length === 1 ? '1 produto' : list.length + ' produtos';

      U.observeReveal(grid);
      U.manageVideos(grid);
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

    if (p.isAnime && window.ALIVE_ANIME) {
      document.getElementById('modalCat').textContent = 'Alive Studio';
      document.getElementById('modalName').textContent = p.name;
      document.getElementById('modalTag').textContent = 'Overlay para Celular e Tablet';
      document.getElementById('modalExtra').innerHTML = '';
      document.getElementById('modalPriceBox').innerHTML =
        '<span class="tag tag-cyan">Overlay Sob Demanda</span><span class="muted" style="font-size:12.5px">Pronto para o app</span>';
      document.getElementById('modalIncludes').innerHTML = '';

      var note = document.getElementById('modalNote');
      if (note) note.style.display = 'none';

      window.ALIVE_ANIME.setupModalForAnime(p);
    } else {
      if (window.ALIVE_ANIME) window.ALIVE_ANIME.resetModalForStandard();

      document.getElementById('modalArt').innerHTML =
        U.previewHtml(p, { controls: true }) + U.badgeHtml(p);
      document.getElementById('modalCat').textContent = 'Comunidade';
      document.getElementById('modalName').textContent = p.name;
      document.getElementById('modalTag').textContent = p.tagline || 'Tema oficial da comunidade';
      document.getElementById('modalExtra').innerHTML =
        p.themeInfo ? U.themeExtraHtml(p) : '';
      document.getElementById('modalPriceBox').innerHTML =
        '<span class="tag tag-cyan">Comunidade</span><span class="muted" style="font-size:12.5px">Pronto para o app</span>';
      document.getElementById('modalIncludes').innerHTML = '';

      var note = document.getElementById('modalNote');
      if (note) note.style.display = 'none';

      var buyBtn = document.getElementById('modalBuy');
      buyBtn.textContent = 'Baixar';
      buyBtn.className = 'btn btn-lg btn-primary';
      buyBtn.onclick = function () {
        U.isFree(p) ? A.download(p) : A.buy(p, { button: buyBtn });
      };
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
          if (searchEl) searchEl.placeholder = 'Buscar animes e desenhos…';
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
          if (searchEl) searchEl.placeholder = 'Buscar temas ou autores…';
          render();
        } else if (state.tab === 'pagos') {
          if (searchEl) searchEl.placeholder = 'Em breve…';
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
