// Alive Bot — API de Notificações Discord para Streamers
import { loadState, saveState } from './_lib/store.js';
import { getTwitchStream, getTwitchUser, buildDiscordPayload, sendDiscordWebhook, getDiscordBotGuilds, getDiscordGuildChannels } from './_lib/discord-notifier.js';
import { botService } from './_lib/irc-bot.js';

export { getTwitchStream, getTwitchUser, buildDiscordPayload, sendDiscordWebhook, getDiscordBotGuilds, getDiscordGuildChannels };

export const DISCORD_BOT_INFO = {
  name: 'Alive Bot',
  inviteUrl: 'https://discord.com/oauth2/authorize?client_id=1563908440638759004&permissions=8&scope=bot%20applications.commands',
};

function resolveDiscordTarget(discordCfg = {}) {
  const raw = String(discordCfg?.webhookUrl || discordCfg?.channelId || discordCfg?.target || '').trim();
  if (raw) return raw;
  return '';
}

function notifyRenderDaemon(channel) {
  if (!channel) return;
  try {
    botService.joinChannel(channel);
  } catch {}
  if (process.env.VERCEL) {
    fetch('https://alive-bot-j126.onrender.com/api/bot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'join', channel }),
    }).catch(() => {});
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    const action = req.query?.action || '';
    const channel = String(req.query?.channel || '').replace(/^#/, '').trim().toLowerCase();

    if (action === 'guilds') {
      const token = req.query?.token;
      const resGuilds = await getDiscordBotGuilds(token);
      if (!resGuilds.ok) return res.status(200).json(resGuilds);

      return res.status(200).json({
        ok: true,
        guilds: resGuilds.guilds || [],
        inviteUrl: DISCORD_BOT_INFO.inviteUrl,
      });
    }

    if (action === 'channels') {
      const guildId = req.query?.guildId;
      if (!guildId) {
        return res.status(400).json({ ok: false, error: 'ID do servidor não informado.', channels: [] });
      }
      const token = req.query?.token;
      const resChannels = await getDiscordGuildChannels(guildId, token);
      return res.status(200).json(resChannels);
    }

    if (!channel) {
      return res.status(200).json({ bot: DISCORD_BOT_INFO, config: null, live: null });
    }

    const state = await loadState(channel);
    const discordCfg = state.config?.discord || {
      enabled: true,
      guildId: '',
      channelId: '',
      webhookUrl: '',
      channelName: 'lives',
      mention: 'everyone',
      roleId: '',
      message: '[LIVE] **{streamer}** está ao vivo na Twitch | **{game}**',
      embedColor: '#9146FF',
      embedTitle: '▸ {title}',
      embedDesc: 'Transmissão iniciada. Venha interagir no chat e pedir músicas.',
      includeThumbnail: true,
      lastStreamId: '',
      lastNotifiedAt: 0,
    };

    const stream = await getTwitchStream(channel);
    const user = await getTwitchUser(channel);

    return res.status(200).json({
      bot: DISCORD_BOT_INFO,
      channel,
      config: discordCfg,
      live: stream ? { ...stream, profile_image_url: user?.profile_image_url } : null,
      user,
    });
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    const action = body.action || 'save';
    const channel = String(body.channel || '').replace(/^#/, '').trim().toLowerCase();

    if (!channel) {
      return res.status(400).json({ error: 'Canal não informado.' });
    }

    const state = await loadState(channel);

    if (action === 'save') {
      const incoming = body.config || {};
      const currentDiscord = state.config?.discord || {};

      const updatedDiscord = {
        ...currentDiscord,
        enabled: incoming.enabled !== undefined ? Boolean(incoming.enabled) : (currentDiscord.enabled !== false),
        guildId: String(incoming.guildId !== undefined ? incoming.guildId : (currentDiscord.guildId || '')).trim(),
        channelId: String(incoming.channelId !== undefined ? incoming.channelId : (currentDiscord.channelId || '')).trim(),
        channelName: String(incoming.channelName || currentDiscord.channelName || 'lives').trim(),
        webhookUrl: String(incoming.webhookUrl !== undefined ? incoming.webhookUrl : (currentDiscord.webhookUrl || '')).trim(),
        mention: String(incoming.mention || currentDiscord.mention || 'everyone').trim(),
        roleId: String(incoming.roleId !== undefined ? incoming.roleId : (currentDiscord.roleId || '')).trim(),
        message: String(incoming.message || currentDiscord.message || '[LIVE] **{streamer}** está ao vivo na Twitch | **{game}**').trim(),
        embedColor: String(incoming.embedColor || currentDiscord.embedColor || '#9146FF').trim(),
        embedTitle: String(incoming.embedTitle || currentDiscord.embedTitle || '▸ {title}').trim(),
        embedDesc: String(incoming.embedDesc || currentDiscord.embedDesc || 'Transmissão iniciada. Venha interagir no chat e pedir músicas.').trim(),
        includeThumbnail: incoming.includeThumbnail !== false,
      };

      if (!updatedDiscord.webhookUrl && updatedDiscord.channelId && /^\d{17,21}$/.test(updatedDiscord.channelId)) {
        updatedDiscord.webhookUrl = updatedDiscord.channelId;
      }

      if (!state.config) state.config = {};
      state.config.discord = updatedDiscord;
      state.updatedAt = Date.now();
      await saveState(state, channel);
      notifyRenderDaemon(channel);

      return res.status(200).json({ ok: true, config: updatedDiscord });
    }

    if (action === 'test') {
      const incoming = body.config || state.config?.discord || {};
      const target = resolveDiscordTarget(incoming);

      if (!target) {
        return res.status(400).json({ error: 'Insira a URL do Webhook do Discord ou o ID do canal antes de testar.' });
      }

      const stream = await getTwitchStream(channel);
      const user = await getTwitchUser(channel);

      const mockStream = stream || {
        user_name: user?.display_name || channel,
        user_login: channel,
        title: 'Transmissão Teste • Configuração do Alive Bot',
        game_name: 'Just Chatting',
        viewer_count: 42,
        thumbnail_url: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${channel}-{width}x{height}.jpg`,
      };

      const payload = buildDiscordPayload({ ...incoming, channel }, mockStream, user || {});

      try {
        await sendDiscordWebhook(target, payload);
        return res.status(200).json({ ok: true, message: 'Notificação de teste enviada com sucesso ao Discord!' });
      } catch (err) {
        return res.status(400).json({ ok: false, error: err.message });
      }
    }

    if (action === 'check') {
      const discordCfg = state.config?.discord;
      const target = resolveDiscordTarget(discordCfg || {});
      if (!discordCfg || !discordCfg.enabled || !target) {
        return res.status(200).json({ live: false, notified: false, reason: 'Notificações desativadas ou sem destino do Discord' });
      }

      const stream = await getTwitchStream(channel);
      const user = await getTwitchUser(channel);

      if (!stream) {
        if (discordCfg.lastStreamId) {
          discordCfg.lastStreamId = '';
          await saveState(state, channel);
        }
        return res.status(200).json({ live: false, notified: false });
      }

      if (discordCfg.lastStreamId === stream.id) {
        return res.status(200).json({ live: true, stream, notified: false, reason: 'Já notificado anteriormente nesta live' });
      }

      const payload = buildDiscordPayload({ ...discordCfg, channel }, stream, user || {});
      try {
        await sendDiscordWebhook(target, payload);
        discordCfg.lastStreamId = stream.id;
        discordCfg.lastNotifiedAt = Date.now();
        await saveState(state, channel);

        console.log(`[alive-discord] Notificação de live enviada com sucesso para #${channel}!`);
        return res.status(200).json({ live: true, stream, notified: true });
      } catch (err) {
        console.error(`[alive-discord] Erro ao enviar notificação de #${channel}:`, err.message);
        return res.status(500).json({ live: true, stream, notified: false, error: err.message });
      }
    }

    return res.status(400).json({ error: 'Ação inválida.' });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Método não permitido' });
}
