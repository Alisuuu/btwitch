// GET /api/bot  -> status do bot backend (@alivebot1)
// POST /api/bot -> gerencia canais e envio de mensagens
import { botService } from './_lib/irc-bot.js';
import { loadState, saveState } from './_lib/store.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    const ch = req.query?.channel ? String(req.query.channel).replace(/^#/, '').trim().toLowerCase() : '';
    const status = botService.getStatus(ch);
    const sinceChat = Number(req.query?.sinceChat || 0);
    const chat = sinceChat > 0
      ? botService.recentChat.filter((m) => (!ch || m.channel === ch) && m.time > sinceChat)
      : botService.recentChat.filter((m) => !ch || m.channel === ch).slice(-50);

    return res.status(200).json({
      ...status,
      chat,
    });
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    const action = body.action || 'status';

    if (action === 'start' || action === 'join') {
      const channel = String(body.channel || '').replace(/^#/, '').trim().toLowerCase();
      if (!channel) {
        return res.status(400).json({ error: 'Canal não informado.' });
      }

      const nick = String(body.nick || '').trim().toLowerCase();
      const token = String(body.token || '').replace(/^oauth:/i, '').trim();

      console.log(`[alive api/bot] @${nick || botService.nick} entrando no canal: #${channel}`);

      // Bot parado e recebendo credenciais (conta do próprio streamer): inicializa com elas.
      if (!botService.running && token) {
        await botService.init({ nick, token, channel });
      } else {
        botService.joinChannel(channel);
      }

      if (process.env.VERCEL) {
        fetch('https://alive-bot-j126.onrender.com/api/bot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }).catch(() => {});
      }

      return res.status(200).json({ ok: true, status: botService.getStatus(channel) });
    }

    if (action === 'send') {
      const channel = String(body.channel || '').replace(/^#/, '').trim().toLowerCase();
      const text = String(body.text || '').trim();
      if (channel && text) {
        const ok = botService.send(text, channel);
        return res.status(200).json({ ok });
      }
      return res.status(400).json({ error: 'Parâmetros inválidos.' });
    }

    if (action === 'part' || action === 'stop') {
      const channel = String(body.channel || '').replace(/^#/, '').trim().toLowerCase();
      if (channel) {
        botService.partChannel(channel);
      } else {
        botService.stop();
      }
      return res.status(200).json({ ok: true, status: botService.getStatus(channel) });
    }

    return res.status(200).json(botService.getStatus(body.channel));
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Método não permitido' });
}
