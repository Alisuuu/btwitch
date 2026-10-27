# Alive Bot

**Bot real para Twitch com fila de músicas do YouTube e widget overlay para OBS Studio.**

Design minimalista preto e branco de alta precisão, pacote vetorial de ícones (Lucide) e suporte tanto a execução contínua no servidor (Node.js nativo via TLS) quanto controle via painel web.

---

## Recursos Principais

- **Bot de Produção em Node.js**: Conexão TLS nativa direta com o IRC da Twitch na porta 6697, sem dependências externas, operando 24/7 sem necessidade de navegador aberto.
- **Fila de Músicas no Chat**:
  - `!play <nome ou link>`: Adiciona músicas e vídeos do YouTube à fila ou toca imediatamente se a fila estiver vazia.
  - `!skip`: Votação para pular música (moderadores pulam instantaneamente).
  - `!fila` / `!atual`: Consulta do estado da fila e faixa em execução.
  - Comandos de moderação: `!pausar`, `!seguir`, `!parar`, `!vol <0-100>`, `!limpar`, `!sortear`, `!remover <pos>`.
- **Comandos Customizados**: Criação em tempo real com `!addcom` / `!delcom` ou pelo painel, com suporte a variáveis `{user}`, `{canal}`, `{np}`, `{fila}`.
- **Widget Overlay OBS**:
  - Fonte Navegador para OBS Studio.
  - Design minimalista monocromático (Preto & Branco).
  - Exibição de capa, progresso, volume e lista das próximas faixas.
  - Player oficial do YouTube com sincronização de áudio/vídeo.
- **Painel de Controle Minimalista**:
  - Tema monocromático limpo e refinado.
  - Pacote de ícones vetoriais de traço fino.
  - Visualização de chat ao vivo, log de eventos, busca no YouTube e controle de volume.

---

## Estrutura do Projeto

```
btwitch/
├── api/              # Endpoints REST (bot, state, search, resolve, twitch)
├── css/
│   ├── panel.css     # Estilo minimalista preto e branco do Painel
│   └── widget.css    # Estilo minimalista preto e branco do Widget OBS
├── js/
│   ├── commands.js   # Sistema de comandos do chat Twitch
│   ├── icons.js      # Pacote de ícones vetoriais (Lucide SVGs)
│   ├── irc.js        # Cliente IRC WebSocket para o navegador
│   ├── panel.js      # Lógica e interface do Painel
│   ├── state.js      # Esquema e sanitização de estado
│   ├── store.js      # Camada reativa de sincronização
│   └── widget.js     # Lógica do player e overlay do OBS
├── lib/
│   ├── irc-bot.js    # Serviço de Bot da Twitch para Node.js (TLS 6697)
│   ├── store.js      # Persistência em disco (data/state.json) ou KV
│   └── youtube.js    # Busca e resolução de metadados do YouTube
├── index.html        # Interface do Painel
├── widget.html       # Overlay do Widget para OBS
├── oauth.html        # Callback OAuth da Twitch
├── server.js         # Servidor HTTP e daemon do Bot
└── smoke.test.mjs    # Bateria de testes automatizados
```

---

## Como Rodar

### 1. Iniciar o Servidor e Bot

```bash
node server.js
```

O servidor iniciará em `http://localhost:3000`.

- **Painel**: [http://localhost:3000/](http://localhost:3000/)
- **Widget OBS**: [http://localhost:3000/widget](http://localhost:3000/widget)
- **API Bot**: [http://localhost:3000/api/bot](http://localhost:3000/api/bot)

### 2. Configurar o Bot

Você pode configurar diretamente pelo arquivo `.env`:

```env
TWITCH_CHANNEL=seucanal
TWITCH_BOT_NICK=seubot
TWITCH_BOT_TOKEN=oauth:seutoken
AUTO_START_BOT=1
```

Ou abrir o painel em `http://localhost:3000/`, ir na aba **Configuração**, preencher seus dados e clicar em **Iniciar no Servidor** ou **Conectar no Navegador**.

### 3. Configurar no OBS Studio

1. No OBS Studio, adicione uma fonte **Navegador**.
2. Cole a URL `http://localhost:3000/widget` (ou seu domínio se hospedado).
3. Defina a resolução (ex: 1920 × 1080).
4. Marque a opção **“Controlar áudio via OBS”**.

---

## Testes

Para executar a suíte de testes de comandos:

```bash
node smoke.test.mjs
```
