// Alive Bot — Conexão Gateway WebSocket persistente e otimizada com o Discord
// Mantém o bot com status ONLINE e atividade no servidor do Discord
import WebSocket from 'ws';

// Códigos de encerramento da Discord Gateway que NUNCA devem tentar reconectar:
// 4004: Falha na autenticação (token inválido/resetado)
// 4010: Shard inválido
// 4011: Sharding obrigatório
// 4012: Versão inválida da API
// 4013: Intent(s) inválidos
// 4014: Intent(s) desabilitados no portal do desenvolvedor
const FATAL_CLOSE_CODES = new Set([4004, 4010, 4011, 4012, 4013, 4014]);

// Códigos onde a sessão anterior não pode ser resumida e precisa de novo identify
const CLEAR_SESSION_CODES = new Set([4007, 4009]);

export class DiscordGateway {
  constructor(token) {
    this._explicitToken = token || '';
    this.ws = null;
    this.heartbeatTimer = null;
    this.reconnectTimer = null;
    this.sequence = null;
    this.sessionId = null;
    this.resumeGatewayUrl = null;
    this.user = null;
    this.connected = false;
    this.isAlive = false;
    this.running = false;
    this.reconnectAttempts = 0;
    this.readyTimer = null;
  }

  get token() {
    return this._explicitToken || process.env.DISCORD_BOT_TOKEN || '';
  }

  set token(val) {
    this._explicitToken = val;
  }

  start() {
    if (this.running) return;
    if (process.env.VERCEL) {
      // Ambientes serverless (Vercel) fecham conexões em poucos segundos e causam reconexões abusivas.
      // O WebSocket persistente do Discord Gateway deve rodar exclusivamente no servidor contínuo (Render/VPS).
      return;
    }
    this.running = true;
    this.connect();
  }

  stop() {
    this.running = false;
    this._cleanup();
    this._destroySocket(1000, 'Normal Closure');
  }

  _cleanup() {
    this.connected = false;
    this.isAlive = false;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.readyTimer) {
      clearTimeout(this.readyTimer);
      this.readyTimer = null;
    }
  }

  _destroySocket(code = 1000, reason = '') {
    if (this.ws) {
      const socket = this.ws;
      this.ws = null;
      try {
        socket.removeAllListeners();
        socket.on('error', () => {}); // Previne uncaught exceptions no encerramento
        if (socket.readyState === WebSocket.OPEN) {
          socket.close(code, reason);
        } else {
          socket.terminate();
        }
      } catch {}
    }
  }

  _scheduleReconnect(customDelay) {
    if (!this.running) return;
    if (this.reconnectTimer) return; // Evita timers concorrentes

    this.reconnectAttempts++;
    // Backoff exponencial: ~2.5s, 5s, 10s, 20s, até max 60s + jitter
    const baseDelay = customDelay ?? Math.min(2500 * Math.pow(1.8, Math.min(this.reconnectAttempts - 1, 6)), 60000);
    const jitter = Math.floor(Math.random() * 1000);
    const delay = Math.round(baseDelay + jitter);

    console.log(`[discord-gateway] Reconectando em ${(delay / 1000).toFixed(1)}s (tentativa ${this.reconnectAttempts})...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  connect() {
    this._cleanup();
    this._destroySocket();

    const token = this.token;
    if (!token) {
      console.warn('[discord-gateway] DISCORD_BOT_TOKEN não configurado.');
      this.running = false;
      return;
    }

    const gatewayUrl = (this.sessionId && this.resumeGatewayUrl)
      ? `${this.resumeGatewayUrl}?v=10&encoding=json`
      : 'wss://gateway.discord.gg/?v=10&encoding=json';

    try {
      const ws = new WebSocket(gatewayUrl);
      this.ws = ws;

      ws.on('open', () => {
        console.log('[discord-gateway] Conectado ao Gateway do Discord.');
      });

      ws.on('message', (data) => {
        try {
          const payload = JSON.parse(data.toString());
          this._handlePayload(payload);
        } catch (err) {
          console.warn('[discord-gateway] Erro ao processar payload:', err.message);
        }
      });

      ws.on('close', (code, reason) => {
        const reasonStr = reason ? reason.toString() : 'sem motivo';
        console.log(`[discord-gateway] Conexão encerrada (${code}): ${reasonStr}`);
        this._cleanup();

        // Se o erro for fatal (ex: token inválido/revogado ou intents negadas), para tudo imediatamente!
        if (FATAL_CLOSE_CODES.has(code)) {
          console.error(`[discord-gateway] ERRO FATAL (${code}): Token inválido ou permissão negada. Reconexão interrompida para proteger sua conta/bot.`);
          this.running = false;
          return;
        }

        if (CLEAR_SESSION_CODES.has(code)) {
          console.warn(`[discord-gateway] Sessão expirada/inválida (${code}). Limpando sessão para novo identify.`);
          this.sessionId = null;
          this.sequence = null;
          this.resumeGatewayUrl = null;
        }

        if (this.running) {
          this._scheduleReconnect();
        }
      });

      ws.on('error', (err) => {
        console.warn('[discord-gateway] Erro no WebSocket:', err.message);
      });
    } catch (e) {
      console.warn('[discord-gateway] Falha ao iniciar WebSocket:', e.message);
      if (this.running) {
        this._scheduleReconnect();
      }
    }
  }

  _handlePayload(payload) {
    const { op, d, s, t } = payload;
    if (s !== null && s !== undefined) {
      this.sequence = s;
    }

    switch (op) {
      case 10: { // Hello
        const interval = d.heartbeat_interval;
        this._startHeartbeat(interval);

        // Se já temos sessionId e sequence válidos, tentamos RESUME (Opcode 6)
        // Isso restaura a sessão SEM contar para o limite de 1000 IDENTIFY diários!
        if (this.sessionId && this.sequence !== null) {
          this._resume();
        } else {
          this._identify();
        }
        break;
      }

      case 11: // Heartbeat ACK
        this.isAlive = true;
        break;

      case 1: // Heartbeat solicitado pelo servidor
        this._sendHeartbeat();
        break;

      case 7: { // Reconnect solicitado pelo Discord
        console.log('[discord-gateway] Discord solicitou reconexão (Opcode 7).');
        this._cleanup();
        this._destroySocket(4000, 'Discord Opcode 7 Reconnect');
        this._scheduleReconnect(1000);
        break;
      }

      case 9: { // Invalid Session
        const resumable = Boolean(d);
        console.warn(`[discord-gateway] Sessão inválida (Opcode 9). Resumível: ${resumable}`);
        if (!resumable) {
          this.sessionId = null;
          this.sequence = null;
          this.resumeGatewayUrl = null;
        }
        this._cleanup();
        this._destroySocket(4000, 'Invalid Session');
        this._scheduleReconnect(resumable ? 1000 : 3000);
        break;
      }

      case 0: // Dispatch Event
        if (t === 'READY') {
          this.connected = true;
          this.user = d.user;
          this.sessionId = d.session_id;
          this.resumeGatewayUrl = d.resume_gateway_url || null;
          console.log(`[discord-gateway] BOT ONLINE NO DISCORD! Usuário: ${d.user?.username}#${d.user?.discriminator || '0000'} | ID: ${d.user?.id}`);

          // Reseta a contagem de tentativas após 20 segundos de conexão estável
          if (this.readyTimer) clearTimeout(this.readyTimer);
          this.readyTimer = setTimeout(() => {
            this.reconnectAttempts = 0;
          }, 20000);
        } else if (t === 'RESUMED') {
          this.connected = true;
          console.log('[discord-gateway] Sessão Discord restaurada com sucesso (RESUMED)!');
          if (this.readyTimer) clearTimeout(this.readyTimer);
          this.readyTimer = setTimeout(() => {
            this.reconnectAttempts = 0;
          }, 20000);
        }
        break;
    }
  }

  _startHeartbeat(interval) {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.isAlive = true;

    // Primeiro heartbeat com jitter conforme documentação oficial do Discord
    const initialJitter = Math.floor(interval * Math.random());
    setTimeout(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      this._sendHeartbeat();

      // Heartbeats subsequentes regulares
      this.heartbeatTimer = setInterval(() => {
        if (!this.isAlive) {
          console.warn('[discord-gateway] Heartbeat ACK não recebido (zombie connection). Reconectando...');
          this._cleanup();
          this._destroySocket(4000, 'Zombied Connection');
          this._scheduleReconnect(1000);
          return;
        }
        this.isAlive = false;
        this._sendHeartbeat();
      }, interval);
    }, initialJitter);
  }

  _sendHeartbeat() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ op: 1, d: this.sequence }));
      } catch {}
    }
  }

  _identify() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({
          op: 2,
          d: {
            token: this.token,
            intents: 513, // Guilds (1) + GuildMessages (512)
            properties: {
              os: 'linux',
              browser: 'alive-bot',
              device: 'alive-bot',
            },
            presence: {
              status: 'online',
              afk: false,
              activities: [
                {
                  name: 'Músicas e Lives na Twitch | !play',
                  type: 0,
                },
              ],
            },
          },
        }));
      } catch (err) {
        console.warn('[discord-gateway] Erro ao enviar IDENTIFY:', err.message);
      }
    }
  }

  _resume() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('[discord-gateway] Tentando restaurar sessão anterior (RESUME)...');
      try {
        this.ws.send(JSON.stringify({
          op: 6,
          d: {
            token: this.token,
            session_id: this.sessionId,
            seq: this.sequence,
          },
        }));
      } catch (err) {
        console.warn('[discord-gateway] Erro ao enviar RESUME:', err.message);
      }
    }
  }
}

export const discordGateway = new DiscordGateway();
