/* ==========================================================================
   ALIVE STORE — ponte de comunicação com o app Alive (WebView)

   COMO FUNCIONA
   -------------
   O app injeta um objeto nativo em `window.Alive` (Android) ou em
   `window.webkit.messageHandlers.alive` (iOS). A loja detecta esse objeto e,
   quando ele existe, as ações são encaminhadas para o app (compras via
   Google Play Billing, downloads, compartilhar...).

   Quando a loja é aberta fora do app (navegador comum), cada ação cai em um
   fallback seguro: compras mostram instruções para abrir o app, downloads
   vão direto para o arquivo.

   CONTRATO (app -> loja)
   ----------------------
   - window.Alive.purchase(requestId, productId, payloadJson)
   - window.Alive.download(requestId, url)
   - window.Alive.share(text)
   - window.Alive.openExternal(url)
   - window.Alive.setAppInfo(json)          // opcional
   - window.AliveBridge.nativeResult(requestId, status, dataJson)
       status: 'ok' | 'cancelled' | 'error'
   ========================================================================== */
(function () {
  'use strict';

  var pending = {};       // requestId -> {resolve, reject}
  var counter = 0;
  var listeners = [];

  function genId() { return 'req_' + Date.now() + '_' + (++counter); }

  function hasAndroidBridge() {
    return typeof window.Alive !== 'undefined' && window.Alive !== null &&
      (typeof window.Alive.purchase === 'function' || typeof window.Alive.download === 'function');
  }

  function hasIOSBridge() {
    try {
      return !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.alive);
    } catch (e) { return false; }
  }

  function isNative() { return hasAndroidBridge() || hasIOSBridge(); }

  function callNative(method, args) {
    if (hasAndroidBridge()) {
      var fn = window.Alive[method];
      if (typeof fn === 'function') {
        // @JavascriptInterface não aceita objetos complexos: passamos strings.
        return fn.apply(window.Alive, args.map(function (a) {
          return typeof a === 'object' && a !== null ? JSON.stringify(a) : a;
        }));
      }
    }
    if (hasIOSBridge()) {
      window.webkit.messageHandlers.alive.postMessage({ method: method, args: args });
    }
  }

  function settle(requestId, status, data) {
    var p = pending[requestId];
    if (!p) return;
    delete pending[requestId];
    var payload = data;
    if (typeof data === 'string') {
      try { payload = JSON.parse(data); } catch (e) { payload = { raw: data }; }
    }
    if (status === 'ok') p.resolve(payload || {});
    else if (status === 'cancelled') p.reject({ code: 'cancelled', data: payload });
    else p.reject({ code: 'error', data: payload });
  }

  var AliveBridge = {
    isNative: isNative,

    /** Registra callback para quando o app informar o app info. */
    onAppInfo: function (cb) { listeners.push(cb); },

    /** O app pode chamar isso para se identificar. */
    setAppInfo: function (json) {
      var info = typeof json === 'string' ? JSON.parse(json) : json;
      listeners.forEach(function (cb) { try { cb(info); } catch (e) {} });
    },

    /**
     * Compra in-app (Google Play Billing).
     * @param {Object} opts { productId, title, priceLabel, payload }
     * @returns {Promise}
     */
    purchase: function (opts) {
      var requestId = genId();
      return new Promise(function (resolve, reject) {
        pending[requestId] = { resolve: resolve, reject: reject };
        if (isNative()) {
          try {
            callNative('purchase', [requestId, opts.productId, {
              title: opts.title || '',
              priceLabel: opts.priceLabel || '',
              payload: opts.payload || {}
            }]);
            return;
          } catch (e) {
            delete pending[requestId];
            reject({ code: 'error', data: { message: String(e) } });
            return;
          }
        }
        // Fora do app: o chamador decide o fallback (a UI mostra o modal).
        delete pending[requestId];
        reject({ code: 'not-native' });
      });
    },

    /**
     * Download de um arquivo (usado nos overlays grátis).
     * @param {String} url
     * @returns {Promise}
     */
    download: function (url) {
      var requestId = genId();
      return new Promise(function (resolve, reject) {
        pending[requestId] = { resolve: resolve, reject: reject };
        if (isNative()) {
          try { callNative('download', [requestId, url]); return; }
          catch (e) { delete pending[requestId]; reject({ code: 'error' }); return; }
        }
        delete pending[requestId];
        // Fallback web: baixa direto.
        try {
          var a = document.createElement('a');
          a.href = url; a.download = '';
          document.body.appendChild(a); a.click(); a.remove();
          resolve({ ok: true });
        } catch (e) { reject({ code: 'error' }); }
      });
    },

    share: function (text) {
      if (isNative()) { try { callNative('share', [text]); return; } catch (e) {} }
      if (navigator.share) { navigator.share({ text: text }).catch(function () {}); return; }
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).catch(function () {});
      }
    },

    openExternal: function (url) {
      if (isNative()) { try { callNative('openExternal', [url]); return; } catch (e) {} }
      window.open(url, '_blank', 'noopener');
    },

    /** Chamada pelo app ao final de uma compra/download. */
    nativeResult: function (requestId, status, data) {
      settle(requestId, status, data);
    },

    /** Diagnóstico: o que a loja enxerga do ambiente. */
    debug: function () {
      return {
        native: isNative(),
        android: hasAndroidBridge(),
        ios: hasIOSBridge(),
        ua: navigator.userAgent,
        protocol: location.protocol
      };
    }
  };

  window.AliveBridge = AliveBridge;
})();
