// Alive Bot — cliente IRC da Twitch por WebSocket (funciona direto no navegador).
// Conexão em tempo real com Twitch IRC:
// - Leitura e escrita quando possui token OAuth da Twitch.
// - Fallback automático e transparente para modo leitura (justinfan) caso o token falhe, expire ou demore.
// Isso garante que o bot NUNCA trave a live do streamer e continue capturando comandos de música.

export class TwitchIRC extends EventTarget {
  constructor({ channel, nick, token = '' } = {}) {
    super();
    this.rawChannel = String(channel || '').trim();
    this.channel = this.rawChannel
      .replace(/^#/, '')
      .replace(/^https?:\/\/(www\.)?twitch\.tv\//i, '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '');

    this.token = String(token || '').replace(/^oauth:/i, '').trim();
    this.nick = String(nick || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    this.readOnly = !this.token;

    if (this.readOnly && (!this.nick || this.nick.startsWith('justinfan'))) {
      this.nick = 'justinfan' + (10000 + Math.floor(Math.random() * 80000));
    }

    this.ws = null;
    this.closedByUser = false;
    this.retry = 0;
    this.authFailed = false;
    this._ready = false;
    this._joined = false;
    this._queue = [];
    this._sending = false;
    this._reconnectTimer = null;
    this._handshakeTimer = null;
    this._heartbeatTimer = null;
    this._lastPing = 0;
    this._dupIdx = 0;
    this._sentLog = [];
    this._buffer = '';
  }

  _emit(type, detail) {
    try {
      if (typeof CustomEvent !== 'undefined') {
        this.dispatchEvent(new CustomEvent(type, { detail }));
      } else {
        const ev = new Event(type);
        ev.detail = detail;
        this.dispatchEvent(ev);
      }
    } catch {
      const ev = new Event(type);
      ev.detail = detail;
      this.dispatchEvent(ev);
    }
  }

  _setStatus(state, message = '') {
    this._emit('status', {
      state,
      message,
      readOnly: this.readOnly,
      nick: this.nick,
      channel: this.channel,
    });
  }

  _clearHandshakeTimer() {
    if (this._handshakeTimer) {
      clearTimeout(this._handshakeTimer);
      this._handshakeTimer = null;
    }
  }

  _startHandshakeTimeout(targetWs) {
    this._clearHandshakeTimer();
    // 20 segundos de timeout para completar o handshake com a Twitch
    this._handshakeTimer = setTimeout(() => {
      if (this.ws !== targetWs) return;
      if (!this._joined && !this.closedByUser) {
        console.warn('[alive irc] handshake timeout com a Twitch, forçando reconexão...');
        this._emit('raw_log', {
          direction: 'info',
          line: 'Tempo limite de resposta da Twitch esgotado. Reconectando...'
        });
        try { targetWs?.close(); } catch { /* */ }
      }
    }, 20000);
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this._lastActivity = Date.now();
    this._lastPing = 0;
    this._heartbeatTimer = setInterval(() => {
      if (!this._joined || this.closedByUser) return;
      const now = Date.now();
      // Watchdog: se enviou PING há > 25s sem resposta da Twitch e sem atividade há > 60s, reconecta
      if (this.ws && (this.ws.readyState !== 1 || (this._lastPing && now - this._lastPing > 25000 && now - this._lastActivity > 60000))) {
        console.warn('[alive irc] Watchdog: sem resposta de PONG da Twitch. Reconectando...');
        this._lastPing = 0;
        this.connect();
        return;
      }

      if (this.ws && this.ws.readyState === 1 && !this.closedByUser) {
        try {
          this.ws.send('PING :tmi.twitch.tv');
          this._lastPing = now;
        } catch { /* ignora */ }
      }
    }, 30000);
  }

  _stopHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  connect() {
    if (!this.channel) {
      this._setStatus('error', 'Canal da Twitch não configurado.');
      return;
    }

    this._clearHandshakeTimer();
    clearTimeout(this._reconnectTimer);
    this._reconnectTimer = null;

    this.closedByUser = false;
    this._ready = false;
    this._joined = false;
    this._sending = false;
    this._queue = [];
    this._setStatus('connecting', 'conectando ao chat...');

    // Se estiver em modo leitura e sem nick, gera justinfan
    if (this.readOnly && (!this.nick || this.nick.startsWith('justinfan'))) {
      this.nick = 'justinfan' + (10000 + Math.floor(Math.random() * 80000));
    }

    // Fecha socket anterior desarmando seus eventos para evitar callbacks fantasmas
    if (this.ws) {
      try {
        const oldWs = this.ws;
        this.ws = null;
        oldWs.onopen = null;
        oldWs.onmessage = null;
        oldWs.onerror = null;
        oldWs.onclose = null;
        oldWs.close();
      } catch { /* ignora */ }
    }

    let ws;
    try {
      ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
    } catch (e) {
      this._setStatus('error', 'Falha ao abrir WebSocket: ' + e.message);
      return;
    }
    this.ws = ws;
    this._buffer = '';

    this._startHandshakeTimeout(ws);

    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.retry = 0;
      this._emit('raw_log', { direction: 'info', line: 'Conexão aberta com o servidor Twitch IRC.' });
      try {
        // Envia CAP REQ primeiro conforme especificação Twitch IRC
        ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands twitch.tv/membership');

        if (this.token && !this.readOnly) {
          ws.send('PASS oauth:' + this.token);
          ws.send('NICK ' + (this.nick || 'justinfan12345'));
        } else {
          ws.send('PASS SCHMOOPIE');
          ws.send('NICK ' + (this.nick || ('justinfan' + Math.floor(10000 + Math.random() * 80000))));
        }
        // Nota: O comando JOIN será enviado assim que a Twitch responder 001 / GLOBALUSERSTATE
      } catch (err) {
        console.error('[alive irc] erro enviando handshake:', err);
      }
    };

    ws.onmessage = (ev) => {
      if (this.ws !== ws) return;
      this._lastActivity = Date.now();
      this._lastPing = 0;
      this._buffer += String(ev.data || '');
      const parts = this._buffer.split('\r\n');
      this._buffer = parts.pop() || '';
      for (const line of parts) {
        if (line.trim()) {
          this._handle(line.trim(), ws);
        }
      }
    };

    ws.onerror = (e) => {
      if (this.ws !== ws) return;
      console.warn('[alive irc] erro ws:', e);
      this._emit('raw_log', { direction: 'error', line: 'Erro de socket WebSocket' });
    };

    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this._clearHandshakeTimer();
      this._stopHeartbeat();
      this._queue = [];
      this._sending = false;

      this._emit('raw_log', {
        direction: 'close',
        line: `Conexão fechada (${ev?.code || 'sem código'}: ${ev?.reason || 'sem motivo'})`
      });

      if (this.closedByUser) {
        this._setStatus('closed', 'desconectado');
        return;
      }

      const wait = Math.min(4000, 1000 + Math.floor(Math.random() * 800));
      this.retry++;
      this._setStatus('reconnecting', `reconectando em ${Math.round(wait / 1000)}s…`);
      this._reconnectTimer = setTimeout(() => {
        if (!this.closedByUser) this.connect();
      }, wait);
    };
  }

  close() {
    this.closedByUser = true;
    this._clearHandshakeTimer();
    this._stopHeartbeat();
    clearTimeout(this._reconnectTimer);
    this._reconnectTimer = null;
    this._queue = [];
    if (this.ws) {
      try {
        const oldWs = this.ws;
        this.ws = null;
        oldWs.onopen = null;
        oldWs.onmessage = null;
        oldWs.onerror = null;
        oldWs.onclose = null;
        oldWs.close();
      } catch { /* */ }
    }
    this._setStatus('closed', 'desconectado');
  }

  disconnect() {
    this.close();
  }

  _handle(line, ws) {
    if (this.ws !== ws) return;

    // PING/PONG (keep-alive)
    if (line.startsWith('PING') || line.includes(' PING ')) {
      try { ws.send('PONG :tmi.twitch.tv'); } catch { /* */ }
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

    // Diagnóstico em tempo real no chat
    if (/001|NOTICE|JOIN|Welcome|authentication failed|Login unsuccessful/i.test(rest)) {
      this._emit('raw_log', { direction: 'in', line: rest });
    }

    // Registrado com sucesso no servidor Twitch (001 RPL_WELCOME ou GLOBALUSERSTATE)
    if (rest.includes(' 001 ') || rest.includes(' GLOBALUSERSTATE ')) {
      this._clearHandshakeTimer();
      this._ready = true;
      this.retry = 0;
      try {
        ws.send('JOIN #' + this.channel);
        this._emit('raw_log', { direction: 'out', line: `Entrando no chat #${this.channel}...` });
      } catch (err) {
        console.error('[alive irc] erro enviando JOIN:', err);
      }
    }

    // Confirmação de presença no canal
    if (rest.includes(' JOIN ') || rest.includes(' ROOMSTATE ') || rest.includes(' 353 ') || rest.includes(' 366 ')) {
      this._clearHandshakeTimer();
      this._ready = true;
      this.retry = 0;
      if (!this._joined) {
        this._joined = true;
        this._startHeartbeat();
        this._setStatus('connected');
        this._emit('connected', {
          readOnly: this.readOnly,
          nick: this.nick,
          channel: this.channel,
        });
      }
    }

    // NOTICE (auth falhou, erro de login, etc.)
    if (rest.includes(' NOTICE ')) {
      const m = rest.match(/NOTICE ([^ ]+) :(.*)$/);
      const text = m ? m[2] : rest;
      if (/authentication failed|invalid nick|Login unsuccessful|Improperly formatted auth|Error logging in/i.test(text)) {
        this._clearHandshakeTimer();
        console.warn('[alive irc] autenticação recusada pela Twitch:', text);
        this.authFailed = true;

        if (!this.readOnly && this.token) {
          // Fallback gracioso imediato para leitura anônima! Não deixa a live sem bot
          console.warn('[alive irc] ativando fallback anônimo imediato após recusa de token');
          this.token = '';
          this.readOnly = true;
          this.nick = 'justinfan' + (10000 + Math.floor(Math.random() * 80000));
          this._emit('auth_fallback', { channel: this.channel, reason: 'auth_failed', text });
          this._emit('raw_log', {
            direction: 'error',
            line: 'Login recusado pela Twitch. Ativando modo leitura anônima para manter a música ativa!'
          });
          this.connect();
          return;
        }

        this._setStatus('error', 'Login da Twitch recusado. Gere novo token.');
      }
      this._emit('notice', { text, channel: m ? m[1] : '', msgId: tags?.['msg-id'] || '' });
      return;
    }

    // PRIVMSG
    const pm = rest.match(/^:([^!]+)![^ ]+ PRIVMSG (#[^ ]+) :([\s\S]*)$/);
    if (pm) {
      const badges = {};
      const t = tags || {};
      if (t.badges) {
        for (const pair of t.badges.split(',')) {
          const [k, v] = pair.split('/');
          if (k) badges[k] = v || '1';
        }
      }
      const userLogin = (t.login || pm[1] || '').toLowerCase();
      const channelName = pm[2].replace('#', '').toLowerCase();
      const isBroadcaster = !!badges.broadcaster || userLogin === channelName;
      const isMod = t.mod === '1' || !!badges.moderator || isBroadcaster;
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

      this._emit('message', {
        userId: t['user-id'] || t.login || pm[1],
        login: t.login || pm[1],
        displayName: t['display-name'] || pm[1],
        text: pm[3],
        mod: isMod,
        broadcaster: isBroadcaster,
        badges,
        color: t.color || '',
        subscriber: t.subscriber === '1',
        messageId: t.id || '',
        self: isSelf,
        isEcho,
        channel: channelName,
      });
      return;
    }

    // USERROOM/ROOMSTATE/USERSTATE
    if (rest.includes(' ROOMSTATE ') || rest.includes(' USERSTATE ')) {
      this._emit('state', { raw: rest, tags });
    }
  }

  // Envia mensagem pro chat com limite de taxa (Twitch: ~20 msgs / 30s por usuário)
  send(text) {
    if (this.readOnly || !this.channel) return false;
    for (const part of splitMessage(text)) this._queue.push(part);
    this._pump();
    return true;
  }

  _pump() {
    if (this._sending) return;
    const next = this._queue.shift();
    if (next === undefined) return;
    if (!this.ws || this.ws.readyState !== 1) {
      this._queue = [];
      this._sending = false;
      return;
    }
    this._sending = true;

    // Safety timeout para garantir que _sending nunca trave (ex: abas em background no mobile)
    const safety = setTimeout(() => {
      if (this._sending) {
        this._sending = false;
        this._pump();
      }
    }, 2500);

    try {
      let toSend = String(next).trim();
      const now = Date.now();
      // Twitch Anti-Duplicate: evita que mensagens idênticas em <30s sejam dropadas pela Twitch
      const isDuplicate = this._sentLog.some((item) => item.text === toSend && (now - item.time < 30000));
      if (isDuplicate) {
        this._dupIdx = ((this._dupIdx || 0) + 1) % 4;
        const zeroWidthChars = ['\u200B', '\u200C', '\u200D', '\uFEFF'];
        toSend = `${toSend} ${zeroWidthChars[this._dupIdx]}`;
      }
      this.ws.send(`PRIVMSG #${this.channel} :${toSend}`);
      this._sentLog.push({ text: String(next).trim(), time: now });
      if (this._sentLog.length > 50) this._sentLog.shift();
    } catch (e) {
      console.warn('[alive irc] erro enviando PRIVMSG:', e);
    } finally {
      setTimeout(() => {
        clearTimeout(safety);
        this._sending = false;
        this._pump();
      }, 420);
    }
  }
}

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
