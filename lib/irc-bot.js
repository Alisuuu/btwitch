// Alive Bot — Bot nativo da Twitch em Node.js (conecta diretamente via TCP 6667).
// Utiliza a conta oficial do bot (@alivebot1) para responder nos chats de todos os streamers.
import net from 'node:net';
import fs from 'node:fs/promises';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createRunner } from '../js/commands.js';
import { loadState, saveState } from './store.js';
import { extractVideoId, extractListId, videoMeta, playlistVideos, searchVideos } from './youtube.js';
import { sanitize } from '../js/state.js';
import { getTwitchStream, getTwitchUser, getKickStream, getYoutubeStream, getTiktokStream, buildDiscordPayload, sendDiscordWebhook } from './discord-notifier.js';
import { discordGateway } from './discord-gateway.js';

export const BOT_DEFAULTS = {
  nick: 'alivebot1',
  token: 'te78do9otbn9t5ia4lxzr3div72dvg',
  refreshToken: 'fq4tfvb4s2x3b3qedq2y5enqt732sjzllm38rwjvkdsbx6upbr',
  clientId: '04ajnvlju5loqchkmzfl7v622veib6',
};

function parseTags(raw) {
  const out = {};
  for (const pair of raw.split(';')) {
    const i = pair.indexOf('=');
    if (i < 0) out[pair] = '';
    else out[pair.slice(0, i)] = pair.slice(i + 1);
  }
  return out;
}

function splitMessage(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const LIMIT = 450;
  if (clean.length <= LIMIT) return [clean];
  const parts = [];
  let cur = '';
  for (const word of clean.split(' ')) {
    if ((cur + ' ' + word).trim().length > LIMIT) {
      if (cur) parts.push(cur);
      cur = word;
    } else {
      cur = (cur + ' ' + word).trim();
    }
  }
  if (cur) parts.push(cur);
  return parts.slice(0, 4);
}

export class TwitchBotService extends EventEmitter {
  constructor() {
    super();
    this.nick = BOT_DEFAULTS.nick;
    this.token = BOT_DEFAULTS.token;
    this.channels = new Set();
    this.socket = null;
    this.connected = false;
    this.running = false;
    this.readOnly = false;
    this.startedAt = 0;
    this._reconnectTimer = null;
    this._heartbeatTimer = null;
    this._lastActivity = 0;
    this._lastPing = 0;
    this._queue = [];
    this._sending = false;
    this._sentLog = [];
    this._dupIdx = 0;
    this.recentChat = [];
    this.runners = new Map();

    this.resolveUrl = async (url) => {
      const videoId = extractVideoId(url);
      const listId = extractListId(url);
      if (videoId) {
        const item = await videoMeta(videoId);
        return { type: 'video', item, items: [item] };
      }
      if (listId) {
        const items = await playlistVideos(listId, 20);
        return { type: 'playlist', items };
      }
      const items = await searchVideos(url, 10);
      return { type: 'search', items };
    };

    this.searchQ = async (q) => {
      return await searchVideos(q, 10);
    };
  }

  // Compatibilidade com APIs
  get channel() {
    return this.channels.values().next().value || '';
  }

  getStatus(targetChannel = '') {
    const ch = String(targetChannel || '').replace(/^#/, '').trim().toLowerCase();
    return {
      running: this.running,
      connected: this.connected,
      channel: ch || this.channel,
      botNick: this.nick,
      readOnly: this.readOnly,
      uptime: this.startedAt ? Date.now() - this.startedAt : 0,
      mode: 'bot-account',
      chatCount: this.recentChat.length,
      channels: Array.from(this.channels),
      totalChannels: this.channels.size,
    };
  }

  async discoverChannels() {
    // 1. Descobre todos os canais cadastrados na pasta data/channels/ ou tmpdir
    try {
      const dirs = [path.join(process.cwd(), 'data', 'channels')];
      const tmpDir = path.join(process.env.TMPDIR || '/tmp', 'alive-data', 'channels');
      dirs.push(tmpDir);

      for (const d of dirs) {
        const files = await fs.readdir(d).catch(() => []);
        for (const f of files) {
          if (f.endsWith('.json')) {
            const ch = f.replace('.json', '').toLowerCase();
            if (ch && !this.channels.has(ch)) {
              this.joinChannel(ch);
            }
          }
        }
      }
    } catch {}

    // 2. Descobre canais sincronizados na nuvem via KVDB (para multi-tenant sem depender de arquivo local)
    try {
      const r = await fetch('https://kvdb.io/WFmviqxrR53HQjSYwnTmAQ/?prefix=state_', {
        signal: AbortSignal.timeout(8000),
        cache: 'no-store',
      });
      if (r.ok) {
        const txt = await r.text();
        for (const line of txt.split('\n')) {
          const k = line.trim();
          if (k.startsWith('state_')) {
            const ch = k.replace('state_', '').toLowerCase().trim();
            if (ch && ch !== 'default' && !this.channels.has(ch)) {
              console.log(`[alive-bot] Canal descoberto na nuvem: #${ch}`);
              this.joinChannel(ch);
            }
          }
        }
      }
    } catch (e) {
      console.warn('[alive-bot] Falha ao consultar KVDB:', e.message);
    }
  }

  async init(config = {}) {
    this.nick = String(config.nick || process.env.TWITCH_BOT_NICK || BOT_DEFAULTS.nick).trim().toLowerCase();
    this.token = String(config.token || process.env.TWITCH_BOT_TOKEN || BOT_DEFAULTS.token).replace(/^oauth:/i, '').trim();
    this.readOnly = !this.token;

    // 1. Descobre todos os canais conhecidos
    await this.discoverChannels();

    // 2. Canais em variáveis de ambiente
    const envChs = (process.env.TWITCH_CHANNELS || process.env.TWITCH_CHANNEL || '').split(',').map((c) => c.replace(/^#/, '').trim().toLowerCase()).filter(Boolean);
    for (const c of envChs) {
      if (c) this.channels.add(c);
    }

    if (config.channel) {
      this.channels.add(String(config.channel).replace(/^#/, '').trim().toLowerCase());
    }

    // Inicia o bot
    this.start();
    return this.getStatus();
  }

  start() {
    if (this.running && this.connected) return true;
    this.running = true;
    this.startedAt = Date.now();
    this.connect();
    this._startDiscordNotifier();
    try { discordGateway.start(); } catch {}
    return true;
  }

  stop() {
    this.running = false;
    this.connected = false;
    clearTimeout(this._reconnectTimer);
    this._stopHeartbeat();
    this._stopDiscordNotifier();
    this._queue = [];
    this._sending = false;
    if (this.socket) {
      try { this.socket.destroy(); } catch {}
      this.socket = null;
    }
    this.emit('status', { state: 'closed' });
  }

  _startDiscordNotifier() {
    this._stopDiscordNotifier();
    this._discordTimer = setInterval(async () => {
      if (!this.running) return;
      await this.discoverChannels();
      for (const ch of this.channels) {
        try {
          const s = await loadState(ch);
          const d = s.config?.discord;
          if (d && d.enabled && (d.webhookUrl || d.channelId)) {
            const target = d.webhookUrl || d.channelId;
            if (!d.lastStreams) d.lastStreams = {};
            const channelsCfg = d.channels || {};
            let stateChanged = false;

            // 1. Twitch
            const twitchCh = channelsCfg.twitch || ch;
            if (twitchCh) {
              const stream = await getTwitchStream(twitchCh);
              if (!stream) {
                if (d.lastStreams.twitch) {
                  d.lastStreams.twitch = '';
                  stateChanged = true;
                }
              } else {
                const lastNotif = d.lastStreams.twitch_notified_at || d.lastNotifiedAt || 0;
                const isRecent = (Date.now() - lastNotif) < 900000;
                if (isRecent) {
                  if (d.lastStreams.twitch !== stream.id) {
                    d.lastStreams.twitch = stream.id;
                    stateChanged = true;
                  }
                } else if (d.lastStreams.twitch !== stream.id) {
                  const user = await getTwitchUser(twitchCh);
                  const payload = buildDiscordPayload({ ...d, channel: twitchCh, platform: 'twitch' }, { ...stream, platform: 'twitch' }, user || {});
                  await sendDiscordWebhook(target, payload);
                  d.lastStreams.twitch = stream.id;
                  d.lastStreams.twitch_notified_at = Date.now();
                  d.lastNotifiedAt = Date.now();
                  stateChanged = true;
                  console.log(`[alive-discord] Notificação de live Twitch enviada para #${twitchCh}!`);
                }
              }
            }

            // 2. Kick
            const kickCh = channelsCfg.kick;
            if (kickCh) {
              const kickStream = await getKickStream(kickCh);
              if (!kickStream) {
                if (d.lastStreams.kick) {
                  d.lastStreams.kick = '';
                  stateChanged = true;
                }
              } else {
                const lastNotif = d.lastStreams.kick_notified_at || d.lastNotifiedAt || 0;
                const isRecent = (Date.now() - lastNotif) < 900000;
                if (isRecent) {
                  if (d.lastStreams.kick !== kickStream.id) {
                    d.lastStreams.kick = kickStream.id;
                    stateChanged = true;
                  }
                } else if (d.lastStreams.kick !== kickStream.id) {
                  const payload = buildDiscordPayload({ ...d, channel: kickCh, platform: 'kick' }, kickStream);
                  await sendDiscordWebhook(target, payload);
                  d.lastStreams.kick = kickStream.id;
                  d.lastStreams.kick_notified_at = Date.now();
                  d.lastNotifiedAt = Date.now();
                  stateChanged = true;
                  console.log(`[alive-discord] Notificação de live Kick enviada para #${kickCh}!`);
                }
              }
            }

            // 3. YouTube
            const ytCh = channelsCfg.youtube;
            if (ytCh) {
              const ytStream = await getYoutubeStream(ytCh);
              if (!ytStream) {
                if (d.lastStreams.youtube) {
                  d.lastStreams.youtube = '';
                  stateChanged = true;
                }
              } else {
                const lastNotif = d.lastStreams.youtube_notified_at || d.lastNotifiedAt || 0;
                const isRecent = (Date.now() - lastNotif) < 900000;
                if (isRecent) {
                  if (d.lastStreams.youtube !== ytStream.id) {
                    d.lastStreams.youtube = ytStream.id;
                    stateChanged = true;
                  }
                } else if (d.lastStreams.youtube !== ytStream.id) {
                  const payload = buildDiscordPayload({ ...d, channel: ytCh, platform: 'youtube' }, ytStream);
                  await sendDiscordWebhook(target, payload);
                  d.lastStreams.youtube = ytStream.id;
                  d.lastStreams.youtube_notified_at = Date.now();
                  d.lastNotifiedAt = Date.now();
                  stateChanged = true;
                  console.log(`[alive-discord] Notificação de live YouTube enviada para @${ytCh}!`);
                }
              }
            }

            // 4. TikTok
            const ttCh = channelsCfg.tiktok;
            if (ttCh) {
              const ttStream = await getTiktokStream(ttCh);
              if (!ttStream) {
                if (d.lastStreams.tiktok) {
                  d.lastStreams.tiktok = '';
                  stateChanged = true;
                }
              } else {
                const lastNotif = d.lastStreams.tiktok_notified_at || d.lastNotifiedAt || 0;
                const isRecent = (Date.now() - lastNotif) < 900000;
                if (isRecent) {
                  if (d.lastStreams.tiktok !== ttStream.id) {
                    d.lastStreams.tiktok = ttStream.id;
                    stateChanged = true;
                  }
                } else if (d.lastStreams.tiktok !== ttStream.id) {
                  const payload = buildDiscordPayload({ ...d, channel: ttCh, platform: 'tiktok' }, ttStream);
                  await sendDiscordWebhook(target, payload);
                  d.lastStreams.tiktok = ttStream.id;
                  d.lastStreams.tiktok_notified_at = Date.now();
                  d.lastNotifiedAt = Date.now();
                  stateChanged = true;
                  console.log(`[alive-discord] Notificação de live TikTok enviada para @${ttCh}!`);
                }
              }
            }

            if (stateChanged) {
              await saveState(s, ch);
            }
          }
        } catch (e) {
          // ignora falha transitória
        }
      }
    }, 60000);
  }

  _stopDiscordNotifier() {
    if (this._discordTimer) {
      clearInterval(this._discordTimer);
      this._discordTimer = null;
    }
  }

  joinChannel(channel) {
    const ch = String(channel || '').replace(/^#/, '').trim().toLowerCase();
    if (!ch) return;
    this.channels.add(ch);
    if (this.socket && this.connected) {
      try {
        console.log(`[alive-bot] Entrando no canal: #${ch}`);
        this.socket.write(`JOIN #${ch}\r\n`);
      } catch (e) {
        console.warn(`[alive-bot] Erro ao entrar em #${ch}:`, e.message);
      }
    }
  }

  partChannel(channel) {
    const ch = String(channel || '').replace(/^#/, '').trim().toLowerCase();
    if (!ch) return;
    this.channels.delete(ch);
    if (this.socket && this.connected) {
      try {
        this.socket.write(`PART #${ch}\r\n`);
      } catch {}
    }
  }

  connect() {
    if (!this.running) return;

    this.connected = false;
    this._sending = false;
    this._queue = [];

    this.readOnly = !this.token;
    if (this.readOnly) {
      this.nick = 'justinfan' + (10000 + Math.floor(Math.random() * 80000));
    }

    this.emit('status', { state: 'connecting' });

    let buffer = '';
    const socket = net.connect({
      host: 'irc.chat.twitch.tv',
      port: 6667,
    });

    this.socket = socket;

    socket.on('connect', () => {
      socket.write('CAP REQ :twitch.tv/tags twitch.tv/commands twitch.tv/membership\r\n');
      if (this.token) {
        socket.write(`PASS oauth:${this.token}\r\n`);
      } else {
        socket.write('PASS SCHMOOPIE\r\n');
      }
      socket.write(`NICK ${this.nick}\r\n`);
    });

    socket.on('data', (chunk) => {
      this._lastActivity = Date.now();
      this._lastPing = 0;
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\r\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (line) this._handleLine(line);
      }
    });

    socket.on('error', (err) => {
      console.warn('[alive-bot] Erro no socket:', err.message);
      this.emit('status', { state: 'error', message: err.message });
    });

    socket.on('close', () => {
      this.connected = false;
      this._stopHeartbeat();
      this._queue = [];
      this._sending = false;
      if (!this.running) {
        this.emit('status', { state: 'closed' });
        return;
      }
      const wait = Math.min(5000, 1000 + Math.floor(Math.random() * 1000));
      this.emit('status', { state: 'reconnecting', message: `Reconectando em ${Math.round(wait / 1000)}s...` });
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = setTimeout(() => this.connect(), wait);
    });
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this._lastActivity = Date.now();
    this._lastPing = 0;
    this._heartbeatTimer = setInterval(() => {
      if (!this.running) return;
      const now = Date.now();
      if (this.connected && this._lastPing && (now - this._lastPing > 25000) && (now - this._lastActivity > 60000)) {
        console.warn('[alive-bot] Watchdog: sem resposta PONG da Twitch. Reconectando...');
        if (this.socket) {
          try { this.socket.destroy(); } catch {}
          this.socket = null;
        }
        this.connected = false;
        this.connect();
        return;
      }

      if (this.socket && !this.socket.destroyed && this.connected) {
        try {
          this.socket.write('PING :tmi.twitch.tv\r\n');
          this._lastPing = now;
        } catch {
          this.connected = false;
          this.connect();
        }
      }
    }, 30000);
  }

  _stopHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  _getOrCreateRunner(targetChannel) {
    const ch = String(targetChannel || '').replace(/^#/, '').trim().toLowerCase();
    let entry = this.runners.get(ch);
    if (!entry) {
      const shim = {
        state: null,
        update: (mutator) => {
          if (!shim.state) return;
          mutator(shim.state);
          shim.state.rev = (shim.state.rev || 0) + 1;
          shim.state.updatedAt = Date.now();
          saveState(shim.state, ch).catch((e) => console.warn(`[alive-bot #${ch}] saveState erro:`, e.message));
          return shim.state;
        },
      };
      const runner = createRunner({
        store: shim,
        send: (txt) => this.send(txt, ch),
        resolveUrl: this.resolveUrl,
        searchQ: this.searchQ,
      });
      entry = { shim, runner };
      this.runners.set(ch, entry);
    }
    return entry;
  }

  _handleLine(line) {
    if (line.startsWith('PING') || line.includes(' PING ')) {
      try { this.socket?.write('PONG :tmi.twitch.tv\r\n'); } catch {}
      return;
    }
    if (line.startsWith('PONG') || line.includes(' PONG ')) {
      this._lastActivity = Date.now();
      this._lastPing = 0;
      return;
    }

    let rest = line;
    let tags = null;
    if (rest.startsWith('@')) {
      const sp = rest.indexOf(' ');
      tags = parseTags(rest.slice(1, sp));
      rest = rest.slice(sp + 1);
    }

    if (!this.connected && (rest.includes(' 001 ') || rest.includes(' GLOBALUSERSTATE ') || rest.includes(' ROOMSTATE '))) {
      this.connected = true;
      this._startHeartbeat();

      // Entra em todos os canais registrados
      for (const ch of this.channels) {
        try { this.socket?.write(`JOIN #${ch}\r\n`); } catch {}
      }

      console.log(`[alive-bot] Conectado e autenticado como @${this.nick}! Canais: ${[...this.channels].map((c) => '#' + c).join(', ')}`);
      this.emit('status', {
        state: 'connected',
        readOnly: this.readOnly,
        nick: this.nick,
        channel: this.channel,
      });
    }

    if (rest.includes(' NOTICE ')) {
      const m = rest.match(/NOTICE ([^ ]+) :(.*)$/);
      const text = m ? m[2] : rest;
      console.warn(`[alive-bot] Twitch NOTICE: ${text}`);
      if (/authentication failed|invalid nick|Login unsuccessful/i.test(text)) {
        this.emit('status', { state: 'error', message: 'Login recusado pela Twitch.' });
      }
      this.emit('notice', { text, channel: m ? m[1] : '' });
      return;
    }

    const pm = rest.match(/^:([^!]+)![^ ]+ PRIVMSG (#[^ ]+) :([\s\S]*)$/);
    if (pm) {
      const safeTags = tags || {};
      const badges = {};
      if (safeTags.badges) {
        for (const pair of safeTags.badges.split(',')) {
          const [k, v] = pair.split('/');
          if (k) badges[k] = v || '1';
        }
      }
      const userLogin = (safeTags.login || pm[1] || '').toLowerCase();
      const channelName = pm[2].replace('#', '').toLowerCase();
      const isBroadcaster = !!badges.broadcaster ||
        userLogin === channelName ||
        (safeTags['display-name'] || '').toLowerCase() === channelName;
      const isMod = safeTags.mod === '1' || !!badges.moderator || isBroadcaster;
      const isSelf = userLogin === this.nick.toLowerCase();

      let isEcho = false;
      if (isSelf) {
        const rawTrimmed = (pm[3] || '').trim();
        const now = Date.now();
        this._sentLog = this._sentLog.filter((item) => (now - item.time) < 15000);
        const idx = this._sentLog.findIndex((item) => item.text === rawTrimmed);
        if (idx !== -1) {
          isEcho = true;
          this._sentLog.splice(idx, 1);
        }
      }

      const msgObj = {
        userId: safeTags['user-id'] || safeTags.login || pm[1],
        login: safeTags.login || pm[1],
        displayName: safeTags['display-name'] || pm[1],
        text: pm[3],
        mod: isMod,
        broadcaster: isBroadcaster,
        badges,
        color: safeTags.color || '',
        subscriber: safeTags.subscriber === '1',
        messageId: safeTags.id || '',
        self: isSelf,
        isEcho,
        channel: channelName,
        time: Date.now(),
      };

      this.recentChat.push(msgObj);
      if (this.recentChat.length > 200) this.recentChat.shift();
      this.emit('message', msgObj);
      console.log(`[alive-bot #${channelName}] Msg de @${userLogin} (isSelf=${isSelf}, isEcho=${isEcho}): ${pm[3]}`);

      // Executa os comandos no canal se for comando iniciado com ! e não for eco do bot
      const rawText = String(msgObj.text || '').trim();
      if (!msgObj.isEcho && rawText.startsWith('!') && rawText.length <= 500) {
        const entry = this._getOrCreateRunner(channelName);
        loadState(channelName).then(async (s) => {
          entry.shim.state = s;
          return entry.runner(msgObj);
        }).catch((err) => {
          console.error(`[alive-bot #${channelName}] erro no runner:`, err);
        });
      }
    }
  }

  send(text, targetChannel = '') {
    const ch = String(targetChannel || this.channel || '').replace(/^#/, '').trim().toLowerCase();
    if (this.readOnly || !ch || !this.connected) {
      console.warn(`[alive-bot #${ch}] envio bloqueado: readOnly=${this.readOnly}, connected=${this.connected}, ch=${ch}`);
      return false;
    }
    for (const part of splitMessage(text)) {
      this._queue.push({ text: part, channel: ch });
    }
    this._pump();
    return true;
  }

  _pump() {
    if (this._sending) return;
    const next = this._queue.shift();
    if (!next) return;
    if (!this.socket || this.socket.destroyed) {
      this._queue = [];
      this._sending = false;
      return;
    }
    this._sending = true;
    const safety = setTimeout(() => {
      if (this._sending) {
        this._sending = false;
        this._pump();
      }
    }, 2500);

    try {
      let toSend = String(next.text).trim();
      const now = Date.now();
      const isDuplicate = this._sentLog.some((item) => item.text === toSend && (now - item.time < 30000));
      if (isDuplicate) {
        this._dupIdx = ((this._dupIdx || 0) + 1) % 4;
        const zeroWidthChars = ['\u200B', '\u200C', '\u200D', '\uFEFF'];
        toSend = `${toSend} ${zeroWidthChars[this._dupIdx]}`;
      }
      console.log(`[alive-bot] Enviando para #${next.channel} como @${this.nick}: ${toSend}`);
      this.socket.write(`PRIVMSG #${next.channel} :${toSend}\r\n`);
      this._sentLog.push({ text: String(next.text).trim(), time: now });
      if (this._sentLog.length > 50) this._sentLog.shift();
    } catch (e) {
      console.warn(`[alive-bot] erro no socket.write para #${next.channel}:`, e.message);
    } finally {
      setTimeout(() => {
        clearTimeout(safety);
        this._sending = false;
        this._pump();
      }, 420);
    }
  }
}

// Instância global única para o servidor Node
export const botService = (globalThis.__aliveBotService = globalThis.__aliveBotService || new TwitchBotService());
