/* ==========================================================================
   ALIVE STORE — Integração de Overlays de Anime Sob Demanda
   ========================================================================== */
(function () {
  'use strict';

  const TMDB_API_KEY = '5e5da432e96174227b25086fe8637985';
  const TMDB_BASE = 'https://api.themoviedb.org/3';
  const IMG_BASE = 'https://image.tmdb.org/t/p/';

  const PRESETS = [
    'Naruto Shippuden', 'Demon Slayer', 'One Piece', 'Attack on Titan',
    'Jujutsu Kaisen', 'Dragon Ball Z', 'Bleach', 'Solo Leveling',
    'Death Note', 'Chainsaw Man', 'Spy x Family', 'Akame ga Kill'
  ];

  const STATE = {
    items: [],
    activeProduct: null,
    activeLogoUrl: null,
    activeBackdropUrl: null,
    activeStandbyUrl: null,
    standbyEnabled: true,
    device: 'celular',
    bannerPosition: 'bottom',
    modalView: 'composition'
  };

  function uuidv4() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /* ---------------- Modelo themeInfo para o Modal Padrão Alive ---------------- */
  function createAnimeThemeInfo(p, device, position, hasLogo) {
    if (hasLogo === undefined) hasLogo = !!STATE.activeLogoUrl;
    const isCelular = device === 'celular';
    const isNone = position === 'none';
    const isBottom = position === 'bottom';
    const isLeft = position === 'left';

    let viewport = {};
    if (isNone) {
      viewport = { locked: true, offset_x: 0.0, offset_y: 0.0, scale_x: 1.0, scale_y: 1.0 };
    } else if (isCelular) {
      if (isBottom) {
        viewport = { locked: true, offset_x: 0.0, offset_y: -0.1, scale_x: 1.0, scale_y: 0.8 };
      } else {
        viewport = { locked: true, offset_x: 0.0, offset_y: 0.1, scale_x: 1.0, scale_y: 0.8 };
      }
    } else {
      if (isLeft) {
        viewport = { locked: true, offset_x: 0.1, offset_y: 0.0, scale_x: 0.8, scale_y: 1.0 };
      } else {
        viewport = { locked: true, offset_x: -0.1, offset_y: 0.0, scale_x: 0.8, scale_y: 1.0 };
      }
    }

    const bannerWidth = isCelular ? 1920 : 384;
    const bannerHeight = isCelular ? 216 : 1080;
    const bannerX = isCelular ? 0.5 : (isLeft ? 0.1 : 0.9);
    const bannerY = isCelular ? (isBottom ? 0.9 : 0.1) : 0.5;
    const bannerName = isCelular ? (isBottom ? 'Banner Base Celular' : 'Banner Topo Celular') : (isLeft ? 'Banner Tablet Esquerda' : 'Banner Tablet Direita');

    const widgets = [];

    if (!isNone) {
      widgets.push({
        name: bannerName,
        type: 'image',
        width: bannerWidth,
        height: bannerHeight,
        x: bannerX,
        y: bannerY,
        normalized_x: bannerX,
        normalized_y: bannerY,
        scale: 1,
        opacity: 1,
        file: 'widget_1_banner.png',
        previewUrl: getProxiedImageUrl(STATE.activeBackdropUrl || p.backdropUrl || p.posterUrl || '')
      });
    }

    widgets.push({
      name: 'Fila de Músicas',
      type: 'musicqueue',
      width: isCelular ? 640 : 560,
      height: isCelular ? 180 : 276,
      x: isCelular ? 0.16666669 : (isLeft ? 0.8541666 : 0.1458334),
      y: isCelular ? (isBottom ? 0.9166666 : 0.12777779) : 0.12777779,
      normalized_x: isCelular ? 0.16666669 : (isLeft ? 0.8541666 : 0.1458334),
      normalized_y: isCelular ? (isBottom ? 0.9166666 : 0.12777779) : 0.12777779,
      scale: 1,
      opacity: 1,
      file: ''
    });

    if (hasLogo) {
      widgets.push({
        name: 'Logo Oficial',
        type: 'image',
        width: isCelular ? 625 : 574,
        height: 640,
        x: isCelular ? 0.10292492 : (isLeft ? 0.90412366 : 0.09587634),
        y: isCelular ? (isBottom ? 0.70789355 : 0.29210645) : 0.8099548,
        normalized_x: isCelular ? 0.10292492 : (isLeft ? 0.90412366 : 0.09587634),
        normalized_y: isCelular ? (isBottom ? 0.70789355 : 0.29210645) : 0.8099548,
        scale: isCelular ? 0.5637166 : 0.6414024,
        opacity: 1,
        file: 'widget_3_logo.png',
        previewUrl: getProxiedImageUrl(STATE.activeLogoUrl || '')
      });
    }

    return {
      themeId: String(p.animeId || p.id),
      name: p.name,
      author: 'Alive Studio',
      version: '1.0',
      widgetCount: widgets.length,
      target_profile: 'custom',
      frame: { enabled: false, border_color: '#00E5FF' },
      viewport: viewport,
      standby: {
        enabled: STATE.standbyEnabled,
        type: STATE.standbyEnabled ? 'video' : '',
        file: STATE.standbyEnabled ? 'standby.mp4' : '',
        title: STATE.standbyEnabled ? 'Aguarde um momento' : '',
        subtitle: ''
      },
      widgets: widgets
    };
  }

  /* ---------------- Filtro exclusivo de Animes e Desenhos (Gênero 16: Animação) ---------------- */
  function isAnimeOrCartoon(item) {
    if (!item) return false;
    if (item.media_type !== 'tv' && item.media_type !== 'movie') return false;
    if (!item.poster_path && !item.backdrop_path) return false;
    const genres = item.genre_ids || [];
    return genres.includes(16);
  }

  /* ---------------- Busca de Animes e Desenhos ---------------- */
  async function searchAnimes(query) {
    if (!query || !query.trim()) return [];
    const q = encodeURIComponent(query.trim());
    try {
      const res = await fetch(`${TMDB_BASE}/search/multi?api_key=${TMDB_API_KEY}&query=${q}&language=pt-BR&include_adult=false`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      let list = (data.results || []).filter(isAnimeOrCartoon);

      if (!list.length) {
        const resEn = await fetch(`${TMDB_BASE}/search/multi?api_key=${TMDB_API_KEY}&query=${q}&include_adult=false`);
        if (resEn.ok) {
          const dataEn = await resEn.json();
          list = (dataEn.results || []).filter(isAnimeOrCartoon);
        }
      }

      const seen = new Set();
      const uniqueList = [];
      for (const item of list) {
        const norm = (item.name || item.title || item.original_name || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!seen.has(item.id) && (!norm || !seen.has(norm))) {
          seen.add(item.id);
          if (norm) seen.add(norm);
          uniqueList.push(item);
        }
      }

      return uniqueList.map(item => {
        const p = {
          id: 'anime-' + item.id,
          animeId: item.id,
          mediaType: item.media_type,
          name: item.name || item.title || item.original_name || 'Anime',
          author: 'Alive Studio',
          tagline: ((item.first_air_date || item.release_date || '').slice(0, 4) || '2026') + ' · Overlay sob demanda',
          description: item.overview || 'Overlay completo com banner e tela de espera pronto para o Alive.',
          category: 'tema',
          price: 0,
          badge: 'new',
          size: '4 MB',
          version: '1.0',
          image: item.backdropUrl || item.posterUrl || (item.backdrop_path ? `${IMG_BASE}original${item.backdrop_path}` : null),
          isAnime: true,
          posterUrl: item.poster_path ? `${IMG_BASE}w500${item.poster_path}` : null,
          backdropUrl: item.backdrop_path ? `${IMG_BASE}original${item.backdrop_path}` : null,
          includes: [
            'Todos os assets originais em .zip',
            'Tema do Alive Studio · versão 1.0',
            'Standby em vídeo: "Aguarde um momento"',
            '3 widget(s): Banner, Fila de Músicas, Logo Oficial',
            'Compatível com Alive App'
          ]
        };
        p.themeInfo = createAnimeThemeInfo(p, 'celular', 'bottom');
        return p;
      });
    } catch (e) {
      console.error(e);
      return [];
    }
  }

  async function fetchLogosAndBackdrops(mediaType, id) {
    try {
      const res = await fetch(`${TMDB_BASE}/${mediaType}/${id}/images?api_key=${TMDB_API_KEY}`);
      if (!res.ok) return { logos: [], backdrops: [] };
      const d = await res.json();
      return {
        logos: (d.logos || []).map(l => `${IMG_BASE}original${l.file_path}`),
        backdrops: (d.backdrops || []).map(b => `${IMG_BASE}original${b.file_path}`)
      };
    } catch (e) {
      return { logos: [], backdrops: [] };
    }
  }

  /* ---------------- Helpers de Proxy de Imagem ---------------- */
  function getProxiedImageUrl(url) {
    if (!url) return '';
    if (url.startsWith('https://image.tmdb.org/') || url.startsWith('http://image.tmdb.org/')) {
      return '/api/proxy-image?url=' + encodeURIComponent(url);
    }
    return url;
  }

  /* ---------------- Render do Banner (Canvas) ---------------- */
  function loadImage(url) {
    return new Promise(resolve => {
      if (!url) return resolve(null);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => {
        if (url.includes('image.tmdb.org') && !url.includes('/api/proxy-image')) {
          const proxied = new Image();
          proxied.crossOrigin = 'anonymous';
          proxied.onload = () => resolve(proxied);
          proxied.onerror = () => resolve(null);
          proxied.src = '/api/proxy-image?url=' + encodeURIComponent(url);
          return;
        }
        resolve(null);
      };
      img.src = url;
    });
  }

  async function renderBannerCanvas() {
    const dev = STATE.device;
    const pos = STATE.bannerPosition;
    const p = STATE.activeProduct;

    const width = dev === 'celular' ? 1920 : 384;
    const height = dev === 'celular' ? 216 : 1080;

    function drawContent(canvas, ctx, withImg) {
      ctx.fillStyle = '#07070a';
      ctx.fillRect(0, 0, width, height);

      if (withImg) {
        try {
          const scale = Math.max(width / withImg.width, height / withImg.height);
          const w = withImg.width * scale;
          const h = withImg.height * scale;
          ctx.drawImage(withImg, (width - w) / 2, (height - h) / 2, w, h);
        } catch (e) {}
      }

      if (dev === 'celular') {
        const grad = ctx.createLinearGradient(0, 0, width, 0);
        grad.addColorStop(0, 'rgba(0, 0, 0, 0.88)');
        grad.addColorStop(0.35, 'rgba(0, 0, 0, 0.45)');
        grad.addColorStop(0.7, 'rgba(0, 0, 0, 0.2)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0.82)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = '#00E5FF';
        const lineY = pos === 'bottom' ? 0 : height - 4;
        ctx.fillRect(0, lineY, width, 4);
      } else {
        const grad = ctx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, 'rgba(0, 0, 0, 0.88)');
        grad.addColorStop(0.35, 'rgba(0, 0, 0, 0.45)');
        grad.addColorStop(0.7, 'rgba(0, 0, 0, 0.2)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0.88)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = '#00E5FF';
        const lineX = pos === 'left' ? width - 4 : 0;
        ctx.fillRect(lineX, 0, 4, height);
      }
    }

    let img = null;
    if (STATE.activeBackdropUrl) {
      img = await loadImage(getProxiedImageUrl(STATE.activeBackdropUrl));
      if (!img) img = await loadImage(STATE.activeBackdropUrl);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    drawContent(canvas, ctx, img);

    let blob = await new Promise(resolve => {
      try {
        canvas.toBlob(resolve, 'image/png');
      } catch (e) {
        resolve(null);
      }
    });

    if (!blob) {
      const fallbackCanvas = document.createElement('canvas');
      fallbackCanvas.width = width;
      fallbackCanvas.height = height;
      const fCtx = fallbackCanvas.getContext('2d');
      drawContent(fallbackCanvas, fCtx, null);
      blob = await new Promise(resolve => fallbackCanvas.toBlob(resolve, 'image/png'));
    }

    return blob;
  }

  async function renderPreviewImage(backdropUrl, animeName) {
    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#07070a';
    ctx.fillRect(0, 0, 1920, 1080);

    let img = null;
    if (backdropUrl) {
      img = await loadImage(getProxiedImageUrl(backdropUrl));
      if (!img) img = await loadImage(backdropUrl);
    }
    if (img) {
      try {
        const scale = Math.max(1920 / img.width, 1080 / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (1920 - w) / 2, (1080 - h) / 2, w, h);
      } catch (e) {}
    }

    const grad = ctx.createLinearGradient(0, 0, 0, 1080);
    grad.addColorStop(0, 'rgba(0,0,0,0.3)');
    grad.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1920, 1080);

    return new Promise(resolve => {
      try {
        canvas.toBlob(resolve, 'image/png');
      } catch (e) {
        resolve(null);
      }
    });
  }

  /* ---------------- Geração do Logo Oficial (PNG) ---------------- */
  async function generateLogoBlob(p) {
    if (STATE.activeLogoUrl) {
      try {
        const lRes = await fetch(getProxiedImageUrl(STATE.activeLogoUrl));
        if (lRes.ok) {
          const lBlob = await lRes.blob();
          if (lBlob && lBlob.size > 0) return lBlob;
        }
      } catch (err) {}
    }

    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 640;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 640, 640);

    const title = (p ? p.name : 'ALIVE').toUpperCase();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0, 229, 255, 0.8)';
    ctx.shadowBlur = 18;
    ctx.font = '900 48px Sora, Inter, sans-serif';

    const words = title.split(' ');
    if (words.length > 2) {
      ctx.fillText(words.slice(0, 2).join(' '), 320, 280);
      ctx.fillText(words.slice(2).join(' '), 320, 350);
    } else {
      ctx.fillText(title, 320, 320);
    }

    return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  }

  /* ---------------- Geração Dinâmica da Tela de Espera do Anime ---------------- */
  async function generateAnimeStandbyVideo(backdropUrl, animeName) {
    const width = 1920;
    const height = 1080;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    let img = null;
    if (backdropUrl) {
      try {
        img = await loadImage(getProxiedImageUrl(backdropUrl));
        if (!img) img = await loadImage(backdropUrl);
      } catch (e) {
        console.warn('Falha ao carregar backdrop para tela de espera:', e);
      }
    }

    function renderStandbyCanvas(progress) {
      ctx.fillStyle = '#07070a';
      ctx.fillRect(0, 0, width, height);

      if (img) {
        try {
          const zoom = 1.0 + (progress || 0) * 0.025;
          const scale = Math.max(width / img.width, height / img.height) * zoom;
          const w = img.width * scale;
          const h = img.height * scale;
          const x = (width - w) / 2;
          const y = (height - h) / 2;
          ctx.drawImage(img, x, y, w, h);
        } catch (err) {}
      }

      // Gradiente suave e cinematográfico
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, 'rgba(7, 7, 10, 0.45)');
      grad.addColorStop(0.5, 'rgba(7, 7, 10, 0.65)');
      grad.addColorStop(1, 'rgba(7, 7, 10, 0.90)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      const centerY = 540;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Ponto ciano pulsante
      const pulse = 0.5 + 0.5 * Math.sin((progress || 0) * Math.PI * 2);
      ctx.shadowBlur = 14;
      ctx.shadowColor = 'rgba(0, 229, 255, 0.9)';
      ctx.fillStyle = '#00E5FF';
      ctx.globalAlpha = 0.6 + 0.4 * pulse;
      ctx.beginPath();
      ctx.arc(960, centerY - 60, 7 + 2 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;

      // Texto simples estrito: "Aguarde um momento"
      ctx.shadowColor = 'rgba(0, 229, 255, 0.55)';
      ctx.shadowBlur = 20;
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 52px Sora, Inter, sans-serif';
      ctx.fillText('Aguarde um momento', 960, centerY);
      ctx.shadowBlur = 0;

      // Rodapé Alive Studio
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.font = '600 16px Sora, Inter, sans-serif';
      ctx.fillText('ALIVE STUDIO · TELA DE ESPERA', 960, 1010);
    }

    // Renderiza frame inicial
    renderStandbyCanvas(0);

    // Se o navegador suporta MediaRecorder com canvas.captureStream
    if (typeof MediaRecorder !== 'undefined' && typeof canvas.captureStream === 'function') {
      let mime = '';
      const candidateMimes = [
        'video/mp4;codecs=avc1',
        'video/mp4',
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm'
      ];
      for (const m of candidateMimes) {
        if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) {
          mime = m;
          break;
        }
      }

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
              if (chunks.length > 0) {
                resolve({ blob: new Blob(chunks, { type: mime }), isVideo: true });
              } else {
                resolve(null);
              }
            };

            recorder.onstop = finish;
            recorder.onerror = () => finish();

            recorder.start();

            let frame = 0;
            const totalFrames = 30; // 1.2s de animação suave
            const interval = setInterval(() => {
              frame++;
              renderStandbyCanvas(frame / totalFrames);
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
          console.warn('MediaRecorder falhou:', recErr);
        }
      }
    }

    // Fallback limpo: PNG de alta fidelidade
    const imageBlob = await new Promise((resolve) => {
      try {
        canvas.toBlob(resolve, 'image/png');
      } catch (e) {
        resolve(null);
      }
    });

    if (imageBlob) {
      return { blob: imageBlob, isVideo: false };
    }
    return null;
  }

  /* ---------------- Geração do ZIP ---------------- */
  async function downloadAnimeZip() {
    if (!window.JSZip) return alert('JSZip não carregado.');
    const p = STATE.activeProduct;
    if (!p) return;

    const btn = document.getElementById('modalBuy');
    const note = document.getElementById('modalNote');
    if (btn) btn.disabled = true;
    if (note) note.textContent = 'Preparando download do pacote…';

    try {
      const zip = new window.JSZip();
      const dev = STATE.device;
      const pos = STATE.bannerPosition;

      // 1. Tela de espera (standby) personalizada do anime
      let standbyFile = '';
      let standbyType = '';
      let standbyBlob = null;

      if (STATE.standbyEnabled) {
        if (note) note.textContent = 'Gerando tela de espera (standby)…';
        const targetStandbyUrl = STATE.activeStandbyUrl || STATE.activeBackdropUrl;

        const pNameLower = (p.name || '').toLowerCase();
        const pIdLower = String(p.id || '').toLowerCase();

        // Temas de demonstração pré-gravados apenas se for realmente Akame ou Artery E o usuário não escolheu outro backdrop
        if (!STATE.activeStandbyUrl && (pIdLower === 'akame' || pNameLower.includes('akame'))) {
          try {
            const sRes = await fetch(dev === 'tablet' ? 'assets/standby_tablet.mp4' : 'assets/standby_akame.mp4');
            if (sRes.ok) standbyBlob = await sRes.blob();
          } catch (e) {}
        } else if (!STATE.activeStandbyUrl && (pIdLower === 'artery' || pNameLower.includes('artery'))) {
          try {
            const sRes = await fetch('assets/standby_artery.mp4');
            if (sRes.ok) standbyBlob = await sRes.blob();
          } catch (e) {}
        }

        // Para qualquer outro anime ou quando o usuário escolheu uma imagem específica de espera
        if (!standbyBlob) {
          const generated = await generateAnimeStandbyVideo(targetStandbyUrl, p.name);
          if (generated && generated.blob) {
            standbyBlob = generated.blob;
            if (generated.isVideo) {
              standbyFile = 'standby.mp4';
              standbyType = 'video';
            } else {
              standbyFile = 'standby.png';
              standbyType = 'image';
            }
          }
        }

        if (standbyBlob) {
          zip.file(standbyFile, standbyBlob);
        }
      }

      // 2. Banner oficial (widget_1_banner.png) - apenas se não for "Sem banner"
      const hasBanner = (pos !== 'none');
      const bannerFilename = 'widget_1_banner.png';
      const previewFilename = 'preview.png';

      if (hasBanner) {
        if (note) note.textContent = 'Renderizando banner oficial…';
        const bannerBlob = await renderBannerCanvas();
        if (bannerBlob) {
          zip.file(bannerFilename, bannerBlob);
        }
      } else {
        if (note) note.textContent = 'Gerando preview do overlay…';
        const previewBlob = await renderPreviewImage(STATE.activeBackdropUrl, p.name);
        if (previewBlob) {
          zip.file(previewFilename, previewBlob);
        }
      }

      // 3. Logo oficial (widget_3_logo.png) - apenas se não for "Sem logo"
      const logoFilename = 'widget_3_logo.png';
      let hasLogo = false;
      if (STATE.activeLogoUrl) {
        if (note) note.textContent = 'Processando logo oficial…';
        const logoBlob = await generateLogoBlob(p);
        if (logoBlob) {
          zip.file(logoFilename, logoBlob);
          hasLogo = true;
        }
      }

      // 4. Viewport e Widgets
      let viewport = {};
      const widgets = [];

      if (!hasBanner) {
        // Sem banner: tela cheia (100% de escala e sem deslocamento)
        viewport = { locked: true, offset_x: 0.0, offset_y: 0.0, scale_x: 1.0, scale_y: 1.0 };
        widgets.push({
          name: 'Fila de Músicas', type: 'musicqueue', file: '',
          width: dev === 'celular' ? 640 : 560, height: dev === 'celular' ? 180 : 276,
          normalized_x: dev === 'celular' ? 0.16666669 : 0.8541666, normalized_y: dev === 'celular' ? 0.9166666 : 0.12777779,
          scale: 1.0, opacity: 1.0, position_index: 6
        });
        if (hasLogo) {
          widgets.push({
            name: 'Logo', type: 'image', file: logoFilename,
            width: dev === 'celular' ? 625 : 574, height: 640,
            normalized_x: dev === 'celular' ? 0.10292492 : 0.90412366, normalized_y: dev === 'celular' ? 0.70789355 : 0.8099548,
            scale: dev === 'celular' ? 0.5637166 : 0.6414024, opacity: 1.0, position_index: 6
          });
        }
      } else if (dev === 'celular') {
        if (pos === 'bottom') {
          viewport = { locked: true, offset_x: 0.0, offset_y: -0.1, scale_x: 1.0, scale_y: 0.8 };
          widgets.push({
            name: 'Banner Base Celular', type: 'image', file: bannerFilename,
            width: 1920, height: 216, normalized_x: 0.5, normalized_y: 0.9, scale: 1.0, opacity: 1.0, position_index: 6
          });
          widgets.push({
            name: 'Fila de Músicas', type: 'musicqueue', file: '', width: 640, height: 180,
            normalized_x: 0.16666669, normalized_y: 0.9166666, scale: 1.0, opacity: 1.0, position_index: 6
          });
          if (hasLogo) {
            widgets.push({
              name: 'Logo', type: 'image', file: logoFilename, width: 625, height: 640,
              normalized_x: 0.10292492, normalized_y: 0.70789355, scale: 0.5637166, opacity: 1.0, position_index: 6
            });
          }
        } else {
          viewport = { locked: true, offset_x: 0.0, offset_y: 0.1, scale_x: 1.0, scale_y: 0.8 };
          widgets.push({
            name: 'Banner Topo Celular', type: 'image', file: bannerFilename,
            width: 1920, height: 216, normalized_x: 0.5, normalized_y: 0.1, scale: 1.0, opacity: 1.0, position_index: 6
          });
          widgets.push({
            name: 'Fila de Músicas', type: 'musicqueue', file: '', width: 640, height: 180,
            normalized_x: 0.16666669, normalized_y: 0.12777779, scale: 1.0, opacity: 1.0, position_index: 6
          });
          if (hasLogo) {
            widgets.push({
              name: 'Logo', type: 'image', file: logoFilename, width: 625, height: 640,
              normalized_x: 0.10292492, normalized_y: 0.29210645, scale: 0.5637166, opacity: 1.0, position_index: 6
            });
          }
        }
      } else {
        if (pos === 'left') {
          viewport = { locked: true, offset_x: 0.1, offset_y: 0.0, scale_x: 0.8, scale_y: 1.0 };
          widgets.push({
            name: 'Banner Tablet Esquerda', type: 'image', file: bannerFilename,
            width: 384, height: 1080, normalized_x: 0.1, normalized_y: 0.5, scale: 1.0, opacity: 1.0, position_index: 6
          });
          widgets.push({
            name: 'Fila de Músicas', type: 'musicqueue', file: '', width: 560, height: 276,
            normalized_x: 0.8541666, normalized_y: 0.12777779, scale: 1.0, opacity: 1.0, position_index: 6
          });
          if (hasLogo) {
            widgets.push({
              name: 'Logo', type: 'image', file: logoFilename, width: 574, height: 640,
              normalized_x: 0.90412366, normalized_y: 0.8099548, scale: 0.6414024, opacity: 1.0, position_index: 6
            });
          }
        } else {
          viewport = { locked: true, offset_x: -0.1, offset_y: 0.0, scale_x: 0.8, scale_y: 1.0 };
          widgets.push({
            name: 'Banner Tablet Direita', type: 'image', file: bannerFilename,
            width: 384, height: 1080, normalized_x: 0.9, normalized_y: 0.5, scale: 1.0, opacity: 1.0, position_index: 6
          });
          widgets.push({
            name: 'Fila de Músicas', type: 'musicqueue', file: '', width: 560, height: 276,
            normalized_x: 0.1458334, normalized_y: 0.12777779, scale: 1.0, opacity: 1.0, position_index: 6
          });
          if (hasLogo) {
            widgets.push({
              name: 'Logo', type: 'image', file: logoFilename, width: 574, height: 640,
              normalized_x: 0.09587634, normalized_y: 0.8099548, scale: 0.6414024, opacity: 1.0, position_index: 6
            });
          }
        }
      }

      // 5. theme.json
      const themeJson = {
        id: uuidv4(),
        name: `${p.name} (${dev === 'celular' ? 'Celular' : 'Tablet'}${!hasBanner ? ' · Sem banner' : ''})`,
        description: `Overlay completo criado no Alive. ${p.name}.`,
        author: 'Alive Studio',
        version: '1.0',
        preview_image: hasBanner ? bannerFilename : previewFilename,
        target_profile: 'custom',
        standby: {
          enabled: STATE.standbyEnabled,
          file: STATE.standbyEnabled ? (standbyFile || 'standby.mp4') : '',
          title: STATE.standbyEnabled ? 'Aguarde um momento' : '',
          subtitle: '',
          type: STATE.standbyEnabled ? (standbyType || 'video') : ''
        },
        background: { enabled: false, file: '', fit_mode: 'crop', opacity: 1.0 },
        frame: {
          border_color: '#00E5FF', border_width: 3.0, corner_radius: 0.0,
          enabled: false, file: '', fit_mode: 'stretch', glow: false, opacity: 1.0
        },
        viewport: viewport,
        widgets: widgets
      };

      zip.file('theme.json', JSON.stringify(themeJson, null, 2));

      // 6. Compressão e Download
      if (note) note.textContent = 'Comprimindo pacote .zip…';
      const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });

      const cleanSlug = p.name.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 18);
      const filename = `theme_${cleanSlug}_${dev}_${pos}_${Date.now()}.zip`;

      const a = document.createElement('a');
      a.href = URL.createObjectURL(zipBlob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);

      if (note) note.textContent = 'Download concluído com sucesso!';
    } catch (err) {
      console.error(err);
      alert('Erro ao gerar o tema: ' + err.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  /* ---------------- Seletores e Controles do Modal de Personalização ---------------- */
  function renderBackdropSelector(backdrops) {
    const backdropGroup = document.getElementById('segBackdropGroup');
    const backdropsRow = document.getElementById('modalBackdropsRow');
    if (!backdropGroup || !backdropsRow) return;

    if (STATE.bannerPosition === 'none') {
      backdropGroup.style.display = 'none';
      return;
    }
    backdropGroup.style.display = 'flex';

    const list = (backdrops && backdrops.length) ? backdrops : (STATE.activeBackdropUrl ? [STATE.activeBackdropUrl] : []);
    if (!list.length) {
      backdropGroup.style.display = 'none';
      return;
    }

    backdropsRow.innerHTML = list.slice(0, 10).map((url, i) => `
      <div class="backdrop-pick ${STATE.activeBackdropUrl === url ? 'active' : ''}" style="background-image:url('${getProxiedImageUrl(url)}')" data-url="${url}" title="Banner ${i + 1}"></div>
    `).join('');

    backdropsRow.querySelectorAll('.backdrop-pick').forEach(item => {
      item.addEventListener('click', () => {
        backdropsRow.querySelectorAll('.backdrop-pick').forEach(x => x.classList.remove('active'));
        item.classList.add('active');
        STATE.activeBackdropUrl = item.dataset.url;
        updateModalArtPreview();
      });
    });
  }

  function renderStandbySelector(backdrops) {
    const standbyGroup = document.getElementById('segStandbyGroup');
    const standbyRow = document.getElementById('modalStandbyRow');
    if (!standbyGroup || !standbyRow) return;

    standbyGroup.style.display = 'flex';

    const sameBtn = `<button type="button" class="standby-pick-btn ${!STATE.activeStandbyUrl && STATE.standbyEnabled ? 'active' : ''}" data-mode="same">Mesmo do banner</button>`;
    const noneBtn = `<button type="button" class="standby-pick-btn ${!STATE.standbyEnabled ? 'active' : ''}" data-mode="none">Sem espera</button>`;
    const list = (backdrops && backdrops.length) ? backdrops : (STATE.activeBackdropUrl ? [STATE.activeBackdropUrl] : []);

    const listHtml = list.slice(0, 8).map((url, i) => `
      <div class="backdrop-pick ${STATE.activeStandbyUrl === url ? 'active' : ''}" style="background-image:url('${getProxiedImageUrl(url)}')" data-url="${url}" data-mode="custom" title="Arte de espera ${i + 1}"></div>
    `).join('');

    standbyRow.innerHTML = sameBtn + listHtml + noneBtn;

    standbyRow.querySelectorAll('.standby-pick-btn, .backdrop-pick').forEach(item => {
      item.addEventListener('click', () => {
        standbyRow.querySelectorAll('.standby-pick-btn, .backdrop-pick').forEach(x => x.classList.remove('active'));
        item.classList.add('active');

        const mode = item.dataset.mode;
        if (mode === 'none') {
          STATE.standbyEnabled = false;
          STATE.activeStandbyUrl = null;
        } else if (mode === 'same') {
          STATE.standbyEnabled = true;
          STATE.activeStandbyUrl = null;
        } else {
          STATE.standbyEnabled = true;
          STATE.activeStandbyUrl = item.dataset.url;
        }

        updateModalArtPreview();
      });
    });
  }

  function renderLogoSelector(logos) {
    const logoGroup = document.getElementById('segLogoGroup');
    const logosRow = document.getElementById('modalLogosRow');
    if (!logoGroup || !logosRow) return;

    logoGroup.style.display = 'flex';

    const noneBtn = `<button type="button" class="logo-pick logo-pick-none ${!STATE.activeLogoUrl ? 'active' : ''}" data-url="">Sem logo</button>`;
    const listHtml = (logos || []).slice(0, 6).map((url, i) => `
      <img class="logo-pick ${STATE.activeLogoUrl === url ? 'active' : ''}" src="${getProxiedImageUrl(url)}" data-url="${url}" alt="Logo ${i + 1}">
    `).join('');

    logosRow.innerHTML = noneBtn + listHtml;

    logosRow.querySelectorAll('.logo-pick').forEach(item => {
      item.addEventListener('click', () => {
        logosRow.querySelectorAll('.logo-pick').forEach(x => x.classList.remove('active'));
        item.classList.add('active');
        STATE.activeLogoUrl = item.dataset.url || null;
        updateModalArtPreview();
      });
    });
  }

  /* ---------------- Atualização do Preview e do themeInfo ---------------- */
  function updateModalArtPreview() {
    const artContainer = document.getElementById('modalArt');
    const p = STATE.activeProduct;
    if (!artContainer || !p || !p.isAnime) return;

    // Sincroniza visibilidade do grupo Banner com a posição escolhida
    const backdropGroup = document.getElementById('segBackdropGroup');
    if (backdropGroup) {
      backdropGroup.style.display = STATE.bannerPosition === 'none' ? 'none' : 'flex';
    }

    // 1. Atualiza themeInfo e a seção oficial de Composição (blueprint 1920x1080)
    const dev = STATE.device;
    const pos = STATE.bannerPosition;
    const hasLogo = !!STATE.activeLogoUrl;

    p.themeInfo = createAnimeThemeInfo(p, dev, pos, hasLogo);

    // 2. Renderiza visualizador no topo com chaveador de Composição e Tela de espera
    const view = STATE.modalView || 'composition';
    const switcherHtml = `
      <div class="modal-art-switcher">
        <button type="button" class="art-switch-btn ${view === 'composition' ? 'active' : ''}" data-view="composition">Composição</button>
        <button type="button" class="art-switch-btn ${view === 'standby' ? 'active' : ''}" data-view="standby">Tela de espera</button>
      </div>
    `;

    if (view === 'composition') {
      const compSvg = window.AliveArt ? window.AliveArt.layoutSvg(p.themeInfo.widgets, null, p.themeInfo.viewport) : '';
      artContainer.innerHTML = `
        <div class="anime-art-wrapper">
          ${switcherHtml}
          ${compSvg}
        </div>
      `;
    } else {
      let standbyBody = '';
      if (!STATE.standbyEnabled) {
        standbyBody = `
          <div class="anime-standby-stage" style="background:#07070a;width:100%;height:100%;">
            <div class="standby-center-box">
              <span class="anime-standby-title" style="color:var(--muted);font-size:24px;">Tela de espera desativada</span>
            </div>
            <div class="standby-footer-tag">ALIVE STUDIO · OVERLAY SEM STANDBY</div>
          </div>
        `;
      } else {
        const rawBgUrl = STATE.activeStandbyUrl || STATE.activeBackdropUrl || p.backdropUrl || p.posterUrl || p.image || '';
        const bgUrl = getProxiedImageUrl(rawBgUrl);
        standbyBody = `
          <div class="anime-standby-stage" style="background-image:linear-gradient(to bottom, rgba(0,0,0,0.45), rgba(0,0,0,0.85)), url('${bgUrl}');width:100%;height:100%;">
            <div class="standby-center-box">
              <div class="standby-pulse-dot"></div>
              <span class="anime-standby-title">Aguarde um momento</span>
            </div>
            <div class="standby-footer-tag">ALIVE STUDIO · TELA DE ESPERA</div>
          </div>
        `;
      }

      artContainer.innerHTML = `
        <div class="anime-art-wrapper">
          ${switcherHtml}
          ${standbyBody}
        </div>
      `;
    }

    // Adiciona listener dos botões do chaveador
    artContainer.querySelectorAll('.art-switch-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        STATE.modalView = btn.dataset.view;
        updateModalArtPreview();
      });
    });

    const extraContainer = document.getElementById('modalExtra');
    if (extraContainer && window.ALIVE_UI && window.ALIVE_UI.themeExtraHtml) {
      extraContainer.innerHTML = window.ALIVE_UI.themeExtraHtml(p);
    }
  }

  async function setupModalForAnime(p) {
    STATE.activeProduct = p;
    STATE.activeBackdropUrl = p.backdropUrl || p.posterUrl || p.image || null;
    STATE.activeStandbyUrl = null;
    STATE.standbyEnabled = true;
    STATE.device = 'celular';
    STATE.bannerPosition = 'bottom';
    STATE.activeLogoUrl = null;
    STATE.modalView = 'composition';

    // Reseta estado dos botões de controle no DOM
    document.querySelectorAll('#modalCustomOptions [data-device]').forEach(b => {
      b.classList.toggle('active', b.dataset.device === 'celular');
    });

    const celGroup = document.getElementById('segPosCelular');
    const tabGroup = document.getElementById('segPosTablet');
    if (celGroup) celGroup.style.display = 'flex';
    if (tabGroup) tabGroup.style.display = 'none';

    document.querySelectorAll('#segPosCelular .seg-item').forEach(b => {
      b.classList.toggle('active', b.dataset.pos === 'bottom');
    });
    document.querySelectorAll('#segPosTablet .seg-item').forEach(b => {
      b.classList.toggle('active', b.dataset.pos === 'left');
    });

    const customOptions = document.getElementById('modalCustomOptions');
    if (customOptions) customOptions.style.display = 'flex';

    const note = document.getElementById('modalNote');
    if (note) note.style.display = 'none';

    const includes = document.getElementById('modalIncludes');
    if (includes) includes.innerHTML = '';

    const buyBtn = document.getElementById('modalBuy');
    if (buyBtn) {
      buyBtn.textContent = 'Baixar';
      buyBtn.className = 'btn btn-lg btn-primary';
      buyBtn.onclick = downloadAnimeZip;
    }

    // Renderiza seletores imediatamente com fallback local para exibição instantânea
    const initialBackdrops = [STATE.activeBackdropUrl].filter(Boolean);
    renderBackdropSelector(initialBackdrops);
    renderStandbySelector(initialBackdrops);
    renderLogoSelector([]);

    updateModalArtPreview();

    // Carrega acervo completo assincronamente e atualiza seletores
    const { logos, backdrops } = await fetchLogosAndBackdrops(p.mediaType, p.animeId);
    if (STATE.activeProduct !== p) return; // Modal foi fechado ou trocado

    if (backdrops && backdrops.length) {
      STATE.activeBackdropUrl = backdrops[0];
      renderBackdropSelector(backdrops);
      renderStandbySelector(backdrops);
    }

    if (logos && logos.length) {
      STATE.activeLogoUrl = logos[0];
      renderLogoSelector(logos);
    }

    updateModalArtPreview();
  }

  function resetModalForStandard() {
    STATE.activeProduct = null;
    const customOptions = document.getElementById('modalCustomOptions');
    if (customOptions) customOptions.style.display = 'none';

    const backdropGroup = document.getElementById('segBackdropGroup');
    if (backdropGroup) backdropGroup.style.display = 'none';

    const standbyGroup = document.getElementById('segStandbyGroup');
    if (standbyGroup) standbyGroup.style.display = 'none';

    const logoGroup = document.getElementById('segLogoGroup');
    if (logoGroup) logoGroup.style.display = 'none';

    const note = document.getElementById('modalNote');
    if (note) note.style.display = 'none';
  }

  /* ---------------- Inicialização e API Global ---------------- */
  let CACHED_PRESETS = null;

  async function loadPresets(forceRefresh) {
    if (!forceRefresh && CACHED_PRESETS && CACHED_PRESETS.length) {
      STATE.items = CACHED_PRESETS.slice();
      return STATE.items;
    }
    const list = [];
    const seen = new Set();
    for (const name of PRESETS.slice(0, 10)) {
      const res = await searchAnimes(name);
      if (res && res[0]) {
        const item = res[0];
        const norm = (item.name || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!seen.has(item.id) && !seen.has(norm)) {
          seen.add(item.id);
          if (norm) seen.add(norm);
          list.push(item);
        }
      }
    }
    if (list.length) {
      CACHED_PRESETS = list.slice();
    }
    STATE.items = list;
    return list;
  }

  function resetToPresets() {
    if (CACHED_PRESETS && CACHED_PRESETS.length) {
      STATE.items = CACHED_PRESETS.slice();
      return true;
    }
    return false;
  }

  function initListeners() {
    document.querySelectorAll('#modalCustomOptions [data-device]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#modalCustomOptions [data-device]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        STATE.device = btn.dataset.device;

        const celGroup = document.getElementById('segPosCelular');
        const tabGroup = document.getElementById('segPosTablet');
        if (STATE.device === 'celular') {
          if (celGroup) celGroup.style.display = 'flex';
          if (tabGroup) tabGroup.style.display = 'none';
          if (STATE.bannerPosition !== 'none') STATE.bannerPosition = 'bottom';
          document.querySelectorAll('#segPosCelular .seg-item').forEach(b => b.classList.toggle('active', b.dataset.pos === STATE.bannerPosition));
        } else {
          if (celGroup) celGroup.style.display = 'none';
          if (tabGroup) tabGroup.style.display = 'flex';
          if (STATE.bannerPosition !== 'none') STATE.bannerPosition = 'left';
          document.querySelectorAll('#segPosTablet .seg-item').forEach(b => b.classList.toggle('active', b.dataset.pos === STATE.bannerPosition));
        }
        updateModalArtPreview();
      });
    });

    document.querySelectorAll('#segPosCelular .seg-item').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#segPosCelular .seg-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        STATE.bannerPosition = btn.dataset.pos;
        updateModalArtPreview();
      });
    });

    document.querySelectorAll('#segPosTablet .seg-item').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#segPosTablet .seg-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        STATE.bannerPosition = btn.dataset.pos;
        updateModalArtPreview();
      });
    });
  }

  window.ALIVE_ANIME = {
    loadPresets: loadPresets,
    resetToPresets: resetToPresets,
    search: searchAnimes,
    getItems: function () { return STATE.items; },
    setItems: function (list) { STATE.items = list; },
    setupModalForAnime: setupModalForAnime,
    resetModalForStandard: resetModalForStandard,
    setModalView: function (v) {
      STATE.modalView = v;
      updateModalArtPreview();
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initListeners);
  } else {
    initListeners();
  }
})();
