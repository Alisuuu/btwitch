/* ==========================================================================
   ALIVE STORE — catálogo de produtos
   ==========================================================================

   ⚠️  PRODUTOS VÊM DO STORAGE (Telegram).
       Os temas enviados para o @Alive1_Bot entram automaticamente pelo
       servidor (GET /api/themes) e aparecem na loja sozinhos.

       Use este array APENAS para produtos fixos que não sejam temas
       (ex.: um overlay seu que você vende e hospeda em outro lugar).
       Se não há nenhum, deixe vazio — a loja fica só com os temas.

   Campos de um produto fixo:
     id         : identificador interno da loja (único, sem espaços)
     playId     : ID do produto IN-APP no Google Play Console
     name       : nome
     tagline    : frase curta do card
     description: texto longo do modal
     category   : tela | cenas | molduras | alertas | pacote
     price      : preço em BRL (0 = grátis)
     badge      : 'hot' | 'new' | 'sale' (opcional)
     featured   : quanto maior, aparece antes em "Destaques"
     salesCount : nº de vendas
     releasedAt : 'AAAA-MM-DD'
     includes   : lista do que vem no pacote
     compat     : ['Alive App', 'OBS Studio']
     theme      : cores da arte preview { bg1, bg2, a1, a2 }
     image      : caminho de imagem opcional (ex: 'img/meu-overlay.png')

   EXEMPLO (descomente para cadastrar):
   {
     id: 'meu-overlay',
     playId: 'overlay_meu_overlay',
     name: 'Meu Overlay',
     tagline: 'Frase curta do card.',
     description: 'Texto longo do modal.',
     category: 'tela',
     price: 19.90,
     featured: 90,
     salesCount: 0,
     releasedAt: '2026-06-01',
     version: '1.0.0',
     updated: '2026-06-01',
     size: '40 MB',
     includes: ['Item 1', 'Item 2'],
     compat: ['Alive App', 'OBS Studio'],
     theme: { bg1: '#1b1046', bg2: '#070714', a1: '#8b5cf6', a2: '#22d3ee' }
   },
   ========================================================================== */

window.ALIVE_CONFIG = {
  // Troque pelos seus dados reais
  supportWhats: '5511999999999',          // número com DDI, só números
  supportEmail: 'suporte@aliveapp.com.br',
  playStoreUrl: 'https://play.google.com/store/apps/details?id=br.alive.app',
  version: '1.0.0'
};

/* Categorias. A loja só exibe as chips que tiverem produto —
   'todos' e 'favoritos' sempre aparecem. */
window.ALIVE_CATEGORIES = [
  { id: 'todos',     label: 'Todos' },
  { id: 'tema',      label: 'Temas' },
  { id: 'gratis',    label: 'Grátis' },
  { id: 'tela',      label: 'Overlays de tela' },
  { id: 'cenas',     label: 'Cenas' },
  { id: 'molduras',  label: 'Molduras de cam' },
  { id: 'alertas',   label: 'Alertas' },
  { id: 'pacote',    label: 'Pacotes' },
  { id: 'favoritos', label: 'Favoritos' }
];

/* ---------- produtos fixos (comunidade e pagos) ---------- */
window.ALIVE_CATALOG = [
  {
    id: 'tema-artery',
    playId: 'theme_b9cc74e5_artery',
    name: 'artery',
    author: 'Alive Studio',
    tagline: 'Overlay completo com bordas, moldura e tela de espera.',
    description: 'Overlay completo com bordas, moldura e tela de espera. Instalado direto no app Alive.',
    category: 'tema',
    price: 0,
    badge: 'new',
    featured: 96,
    salesCount: 0,
    releasedAt: '2026-11-21',
    version: '1.0',
    size: '4.4 MB',
    standbyVideo: 'assets/standby_artery.mp4',
    image: 'assets/preview_artery.jpg',
    downloadUrl: '/api/themes/fmwqmw4fb4i807/download',
    includes: [
      'Standby em vídeo: "Aguarde um momento"',
      '4 widget(s): Banner Base Celular, Fonte Web 1, Fonte Web 2, Fila de Músicas',
      'Todos os assets originais em .zip',
      'Tema do Alive Studio · versão 1.0'
    ],
    compat: ['Alive App'],
    themeInfo: {
      themeId: 'b9cc74e5-ff6b-49f8-a2c4-44199b6d7590',
      name: 'artery',
      author: 'Alive Studio',
      version: '1.0',
      widgetCount: 4,
      target_profile: 'custom',
      viewport: { locked: true, offset_x: 0, offset_y: -0.1, scale_x: 1, scale_y: 0.8 },
      frame: { enabled: false, border_color: '#00E5FF' },
      standby: { enabled: true, type: 'video', file: 'standby.mp4', title: 'Aguarde um momento', subtitle: '' },
      widgets: [
        { name: 'Banner Base Celular', type: 'image', file: 'widget_1_widget_media_1794774365452.jpg', width: 1920, height: 216, x: 0.5, y: 0.9, scale: 1, opacity: 1 },
        { name: 'Fonte Web 1', type: 'link', file: '', width: 1958, height: 485, x: 0.18858053, y: 0.9247425, scale: 0.33516732, opacity: 1 },
        { name: 'Fonte Web 2', type: 'link', file: '', width: 990, height: 1203, x: 0.08084439, y: 0.16368464, scale: 0.2447743, opacity: 1 },
        { name: 'Fila de Músicas', type: 'musicqueue', file: '', width: 560, height: 280, x: 0.78818476, y: 0.8703704, scale: 1, opacity: 1 }
      ]
    }
  },
  {
    id: 'tema-akame4',
    playId: 'theme_09529ea8_akame4',
    name: 'akame4',
    tagline: 'Overlay completo com bordas, moldura e tela de espera.',
    description: 'Overlay completo com bordas, moldura e tela de espera. Instalado direto no app Alive.',
    category: 'tema',
    price: 0,
    badge: 'hot',
    featured: 98,
    salesCount: 0,
    releasedAt: '2026-11-21',
    version: '1.0',
    size: '6.2 MB',
    standbyVideo: 'assets/standby_akame.mp4',
    image: 'assets/preview_akame.png',
    downloadUrl: '/api/themes/fmwqqxktd3/download',
    includes: [
      'Standby em vídeo: "Aguarde um momento"',
      '4 widget(s): Banner Base Celular, Fila de Músicas, Imagem 3, Fila de Músicas 2',
      'Todos os assets originais em .zip',
      'Tema do Alive Studio · versão 1.0'
    ],
    compat: ['Alive App'],
    themeInfo: {
      themeId: '09529ea8-6ec5-4598-ae34-bfa6ab0eb6f6',
      name: 'akame4',
      author: 'Alive Studio',
      version: '1.0',
      widgetCount: 4,
      target_profile: 'custom',
      viewport: { locked: true, offset_x: 0, offset_y: -0.1, scale_x: 1, scale_y: 0.8 },
      frame: { enabled: false, border_color: '#00E5FF' },
      standby: { enabled: true, type: 'video', file: 'standby.mp4', title: 'Aguarde um momento', subtitle: '' },
      widgets: [
        { name: 'Banner Base Celular', type: 'image', file: 'widget_1_widget_media_1795275372728.png', width: 1920, height: 216, x: 0.5, y: 0.9, scale: 1, opacity: 1 },
        { name: 'Fila de Músicas', type: 'musicqueue', file: '', width: 640, height: 180, x: 0.16666669, y: 0.9166666, scale: 1, opacity: 1 },
        { name: 'Imagem 3', type: 'image', file: 'widget_3_widget_media_1795275389656.png', width: 625, height: 640, x: 0.10292492, y: 0.70789355, scale: 0.5637166, opacity: 1 },
        { name: 'Fila de Músicas 2', type: 'musicqueue', file: '', width: 560, height: 276, x: 0.8541666, y: 0.12777779, scale: 1, opacity: 1 }
      ]
    }
  },
  {
    id: 'tema-akame-tablet',
    playId: 'theme_29f89004_akame_tablet',
    name: 'akame tablet',
    tagline: 'Overlay completo para tablet com banner vertical e tela de espera.',
    description: 'Overlay completo com banner lateral para tablet e tela de espera. Instalado direto no app Alive.',
    category: 'tema',
    price: 0,
    badge: 'new',
    featured: 97,
    salesCount: 0,
    releasedAt: '2026-11-21',
    version: '1.0',
    size: '5.7 MB',
    standbyVideo: 'assets/standby_tablet.mp4',
    image: 'assets/preview_tablet.jpg',
    downloadUrl: '/api/themes/fmwqqxdgf2/download',
    includes: [
      'Standby em vídeo: "Aguarde um momento"',
      '3 widget(s): Banner Tablet Esquerda, Fila de Músicas 2, Imagem 4',
      'Todos os assets originais em .zip',
      'Tema do Alive Studio · versão 1.0'
    ],
    compat: ['Alive App'],
    themeInfo: {
      themeId: '29f89004-6de3-4e10-be06-5d9d96ab014a',
      name: 'akame tablet',
      author: 'Alive Studio',
      version: '1.0',
      widgetCount: 3,
      target_profile: 'custom',
      viewport: { locked: true, offset_x: 0.1, offset_y: 0, scale_x: 0.8, scale_y: 1 },
      frame: { enabled: false, border_color: '#00E5FF' },
      standby: { enabled: true, type: 'video', file: 'standby.mp4', title: 'Aguarde um momento', subtitle: '' },
      widgets: [
        { name: 'Banner Tablet Esquerda', type: 'image', file: 'widget_1_widget_media_1795282756701.jpg', width: 384, height: 1080, x: 0.1, y: 0.5, scale: 1, opacity: 1 },
        { name: 'Fila de Músicas 2', type: 'musicqueue', file: '', width: 560, height: 276, x: 0.8541666, y: 0.12777779, scale: 1, opacity: 1 },
        { name: 'Imagem 4', type: 'image', file: 'widget_3_widget_media_1795277389018.png', width: 574, height: 640, x: 0.90412366, y: 0.8099548, scale: 0.6414024, opacity: 1 }
      ]
    }
  }
];

/* ---------- helpers ---------- */
window.ALIVE_HELPERS = {
  byId: function (id) {
    return window.ALIVE_CATALOG.filter(function (p) { return p.id === id; })[0] || null;
  },
  byCategory: function (cat) {
    if (cat === 'todos') return window.ALIVE_CATALOG.slice();
    if (cat === 'gratis') return window.ALIVE_CATALOG.filter(function (p) { return p.price === 0; });
    if (cat === 'favoritos') return [];
    return window.ALIVE_CATALOG.filter(function (p) { return p.category === cat; });
  },
  related: function (id, n) {
    var p = window.ALIVE_HELPERS.byId(id);
    if (!p) return [];
    var score = function (x) {
      return (x.category === p.category ? 1000 : 0) + (x.featured || 0);
    };
    return window.ALIVE_CATALOG
      .filter(function (x) { return x.id !== id; })
      .sort(function (a, b) { return score(b) - score(a); })
      .slice(0, n || 3);
  }
};
