// Alive Bot — API de Notificações Discord para Streamers
import { loadState, saveState } from './_lib/store.js';
import {
  getTwitchStream, getTwitchUser, getKickStream, getYoutubeStream, getTiktokStream,
  buildDiscordPayload, sendDiscordWebhook, getDiscordBotGuilds, getDiscordGuildChannels,
} from './_lib/discord-notifier.js';
import { botService } from './_lib/irc-bot.js';

export {
  getTwitchStream, getTwitchUser, getKickStream, getYoutubeStream, getTiktokStream,
  buildDiscordPayload, sendDiscordWebhook, getDiscordBotGuilds, getDiscordGuildChannels,
};

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

    if (!channel || channel === 'streamer') {
      return res.status(200).json({ bot: DISCORD_BOT_INFO, config: null, live: null });
    }

    const state = await loadState(channel);
    let discordCfg = state.config?.discord;

    if (!discordCfg) {
      discordCfg = {
        enabled: true,
        guildId: '',
        channelId: '',
        webhookUrl: '',
        channelName: 'lives',
        mention: 'everyone',
        roleId: '',
        channels: {
          twitch: channel,
          youtube: '',
          kick: '',
          tiktok: '',
        },
        message: '[LIVE] **{streamer}** está ao vivo no {platform} | **{game}**',
        embedColor: '#9146FF',
        embedTitle: '▸ {title}',
        embedDesc: 'Transmissão iniciada. Venha interagir no chat e pedir músicas.',
        includeThumbnail: true,
        thumbType: 'auto',
        customThumbnail: '',
        lastStreamId: '',
        lastStreams: {},
        lastNotifiedAt: 0,
      };
    }
    if (!discordCfg.channels) {
      discordCfg.channels = {
        twitch: channel,
        youtube: '',
        kick: '',
        tiktok: '',
      };
    }

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

      const channelsCfg = {
        twitch: String(incoming.channels?.twitch !== undefined ? incoming.channels.twitch : (currentDiscord.channels?.twitch || channel || '')).trim(),
        youtube: String(incoming.channels?.youtube !== undefined ? incoming.channels.youtube : (currentDiscord.channels?.youtube || '')).trim(),
        kick: String(incoming.channels?.kick !== undefined ? incoming.channels.kick : (currentDiscord.channels?.kick || '')).trim(),
        tiktok: String(incoming.channels?.tiktok !== undefined ? incoming.channels.tiktok : (currentDiscord.channels?.tiktok || '')).trim(),
      };

      const updatedDiscord = {
        ...currentDiscord,
        enabled: incoming.enabled !== undefined ? Boolean(incoming.enabled) : (currentDiscord.enabled !== false),
        guildId: String(incoming.guildId !== undefined ? incoming.guildId : (currentDiscord.guildId || '')).trim(),
        channelId: String(incoming.channelId !== undefined ? incoming.channelId : (currentDiscord.channelId || '')).trim(),
        channelName: String(incoming.channelName || currentDiscord.channelName || 'lives').trim(),
        webhookUrl: String(incoming.webhookUrl !== undefined ? incoming.webhookUrl : (currentDiscord.webhookUrl || '')).trim(),
        mention: String(incoming.mention || currentDiscord.mention || 'everyone').trim(),
        roleId: String(incoming.roleId !== undefined ? incoming.roleId : (currentDiscord.roleId || '')).trim(),
        message: String(incoming.message || currentDiscord.message || '[LIVE] **{streamer}** está ao vivo no {platform} | **{game}**').trim(),
        embedColor: String(incoming.embedColor || currentDiscord.embedColor || '#9146FF').trim(),
        embedTitle: String(incoming.embedTitle || currentDiscord.embedTitle || '▸ {title}').trim(),
        embedDesc: String(incoming.embedDesc || currentDiscord.embedDesc || 'Transmissão iniciada. Venha assistir e interagir!').trim(),
        includeThumbnail: incoming.thumbType === 'none' ? false : (incoming.includeThumbnail !== false),
        thumbType: ['auto', 'custom', 'none'].includes(incoming.thumbType) ? incoming.thumbType : (incoming.includeThumbnail === false ? 'none' : (currentDiscord.thumbType || 'auto')),
        customThumbnail: String(incoming.customThumbnail !== undefined ? incoming.customThumbnail : (currentDiscord.customThumbnail || '')).trim(),
        channels: channelsCfg,
      };

      if (!updatedDiscord.webhookUrl && updatedDiscord.channelId && /^\d{17,21}$/.test(updatedDiscord.channelId)) {
        updatedDiscord.webhookUrl = updatedDiscord.channelId;
      }

      if (!state.config) state.config = {};
      state.config.discord = updatedDiscord;
      state.updatedAt = Date.now();
      await saveState(state, channel);
      notifyRenderDaemon(channel);

      // Sincroniza também sob a chave do canal Twitch caso o login difira
      if (channelsCfg.twitch && channelsCfg.twitch !== channel) {
        try {
          const twitchState = await loadState(channelsCfg.twitch);
          if (!twitchState.config) twitchState.config = {};
          twitchState.config.discord = updatedDiscord;
          twitchState.updatedAt = Date.now();
          await saveState(twitchState, channelsCfg.twitch);
          notifyRenderDaemon(channelsCfg.twitch);
        } catch {}
      }

      return res.status(200).json({ ok: true, config: updatedDiscord });
    }

    if (action === 'test') {
      const incoming = body.config || state.config?.discord || {};
      const target = resolveDiscordTarget(incoming);
      const testPlatform = String(body.platform || incoming.platform || 'twitch').toLowerCase();

      if (!target) {
        return res.status(400).json({ error: 'Insira a URL do Webhook do Discord ou o ID do canal antes de testar.' });
      }

      const channelsCfg = incoming.channels || {};
      let stream = null;
      let user = null;

      if (testPlatform === 'kick') {
        const kickCh = channelsCfg.kick || channel;
        stream = await getKickStream(kickCh);
        if (!stream) {
          stream = {
            platform: 'kick',
            user_name: kickCh,
            user_login: kickCh,
            title: 'Live Teste na Kick • Alive Bot',
            game_name: 'Just Chatting',
            viewer_count: 75,
            thumbnail_url: '',
            url: `https://kick.com/${kickCh}`,
          };
        }
      } else if (testPlatform === 'youtube') {
        const ytCh = channelsCfg.youtube || `@${channel}`;
        stream = await getYoutubeStream(ytCh);
        if (!stream) {
          stream = {
            platform: 'youtube',
            user_name: ytCh.startsWith('@') ? ytCh : `@${ytCh}`,
            user_login: ytCh.replace(/^@/, ''),
            title: 'Live Teste no YouTube • Alive Bot',
            game_name: 'Gaming',
            viewer_count: null,
            thumbnail_url: '',
            url: `https://youtube.com/${ytCh}`,
          };
        }
      } else if (testPlatform === 'tiktok') {
        const ttCh = channelsCfg.tiktok || `@${channel}`;
        stream = await getTiktokStream(ttCh);
        if (!stream) {
          stream = {
            platform: 'tiktok',
            user_name: ttCh.startsWith('@') ? ttCh : `@${ttCh}`,
            user_login: ttCh.replace(/^@/, ''),
            title: 'Live Teste no TikTok • Alive Bot',
            game_name: 'TikTok Live',
            viewer_count: null,
            thumbnail_url: '',
            url: `https://tiktok.com/@${ttCh.replace(/^@/, '')}/live`,
          };
        }
      } else {
        const twitchCh = channelsCfg.twitch || channel;
        stream = await getTwitchStream(twitchCh);
        user = await getTwitchUser(twitchCh);

        if (!stream) {
          stream = {
            platform: 'twitch',
            user_name: user?.display_name || twitchCh,
            user_login: twitchCh,
            title: 'Transmissão Teste na Twitch • Configuração do Alive Bot',
            game_name: 'Just Chatting',
            viewer_count: 42,
            thumbnail_url: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${twitchCh}-{width}x{height}.jpg`,
            url: `https://twitch.tv/${twitchCh}`,
          };
        } else {
          stream = { ...stream, platform: 'twitch' };
        }
      }

      const payload = buildDiscordPayload({ ...incoming, channel, platform: testPlatform }, stream, user || {});

      try {
        await sendDiscordWebhook(target, payload, { isTest: true });
        const namePlatform = testPlatform === 'kick' ? 'Kick' : testPlatform === 'youtube' ? 'YouTube' : testPlatform === 'tiktok' ? 'TikTok' : 'Twitch';
        return res.status(200).json({ ok: true, message: `Notificação de teste (${namePlatform}) enviada com sucesso ao Discord!` });
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

      if (!discordCfg.lastStreams) discordCfg.lastStreams = {};
      const channelsCfg = discordCfg.channels || {};
      const results = {};
      let anyNotified = false;

      // 1. Twitch
      const twitchCh = channelsCfg.twitch || channel;
      if (twitchCh) {
        const stream = await getTwitchStream(twitchCh);
        results.twitch = stream ? { live: true, title: stream.title } : { live: false };
        if (stream) {
          const lastNotif = discordCfg.lastStreams.twitch_notified_at || discordCfg.lastNotifiedAt || 0;
          const isRecent = (Date.now() - lastNotif) < 900000;
          if (isRecent) {
            if (discordCfg.lastStreams.twitch !== stream.id) {
              discordCfg.lastStreams.twitch = stream.id;
            }
          } else if (discordCfg.lastStreams.twitch !== stream.id) {
            const user = await getTwitchUser(twitchCh);
            const payload = buildDiscordPayload({ ...discordCfg, channel: twitchCh, platform: 'twitch' }, { ...stream, platform: 'twitch' }, user || {});
            await sendDiscordWebhook(target, payload);
            discordCfg.lastStreams.twitch = stream.id;
            discordCfg.lastStreams.twitch_notified_at = Date.now();
            anyNotified = true;
          }
        } else {
          discordCfg.lastStreams.twitch = '';
        }
      }

      // 2. Kick
      const kickCh = channelsCfg.kick;
      if (kickCh) {
        const kickStream = await getKickStream(kickCh);
        results.kick = kickStream ? { live: true, title: kickStream.title } : { live: false };
        if (kickStream) {
          const lastNotif = discordCfg.lastStreams.kick_notified_at || discordCfg.lastNotifiedAt || 0;
          const isRecent = (Date.now() - lastNotif) < 900000;
          if (isRecent) {
            if (discordCfg.lastStreams.kick !== kickStream.id) {
              discordCfg.lastStreams.kick = kickStream.id;
            }
          } else if (discordCfg.lastStreams.kick !== kickStream.id) {
            const payload = buildDiscordPayload({ ...discordCfg, channel: kickCh, platform: 'kick' }, kickStream);
            await sendDiscordWebhook(target, payload);
            discordCfg.lastStreams.kick = kickStream.id;
            discordCfg.lastStreams.kick_notified_at = Date.now();
            anyNotified = true;
          }
        } else {
          discordCfg.lastStreams.kick = '';
        }
      }

      // 3. YouTube
      const ytCh = channelsCfg.youtube;
      if (ytCh) {
        const ytStream = await getYoutubeStream(ytCh);
        results.youtube = ytStream ? { live: true, title: ytStream.title } : { live: false };
        if (ytStream) {
          const lastNotif = discordCfg.lastStreams.youtube_notified_at || discordCfg.lastNotifiedAt || 0;
          const isRecent = (Date.now() - lastNotif) < 900000;
          if (isRecent) {
            if (discordCfg.lastStreams.youtube !== ytStream.id) {
              discordCfg.lastStreams.youtube = ytStream.id;
            }
          } else if (discordCfg.lastStreams.youtube !== ytStream.id) {
            const payload = buildDiscordPayload({ ...discordCfg, channel: ytCh, platform: 'youtube' }, ytStream);
            await sendDiscordWebhook(target, payload);
            discordCfg.lastStreams.youtube = ytStream.id;
            discordCfg.lastStreams.youtube_notified_at = Date.now();
            anyNotified = true;
          }
        } else {
          discordCfg.lastStreams.youtube = '';
        }
      }

      // 4. TikTok
      const ttCh = channelsCfg.tiktok;
      if (ttCh) {
        const ttStream = await getTiktokStream(ttCh);
        results.tiktok = ttStream ? { live: true, title: ttStream.title } : { live: false };
        if (ttStream) {
          const lastNotif = discordCfg.lastStreams.tiktok_notified_at || discordCfg.lastNotifiedAt || 0;
          const isRecent = (Date.now() - lastNotif) < 900000;
          if (isRecent) {
            if (discordCfg.lastStreams.tiktok !== ttStream.id) {
              discordCfg.lastStreams.tiktok = ttStream.id;
            }
          } else if (discordCfg.lastStreams.tiktok !== ttStream.id) {
            const payload = buildDiscordPayload({ ...discordCfg, channel: ttCh, platform: 'tiktok' }, ttStream);
            await sendDiscordWebhook(target, payload);
            discordCfg.lastStreams.tiktok = ttStream.id;
            discordCfg.lastStreams.tiktok_notified_at = Date.now();
            anyNotified = true;
          }
        } else {
          discordCfg.lastStreams.tiktok = '';
        }
      }

      if (anyNotified) {
        discordCfg.lastNotifiedAt = Date.now();
      }
      await saveState(state, channel);

      return res.status(200).json({ ok: true, notified: anyNotified, platforms: results });
    }

    if (action === 'live_start') {
      const livePlatform = String(body.platform || 'twitch').toLowerCase();
      const liveChannel = String(body.channel || channel || '').replace(/^#/, '').trim().toLowerCase();
      const liveTitle = String(body.title || '').trim();
      const liveGame = String(body.category || body.game || '').trim();
      const liveSessionId = String(body.session_id || '').trim();

      if (!liveChannel) {
        return res.status(400).json({ error: 'Canal não informado.' });
      }

      let targetState = await loadState(liveChannel);
      let targetCfg = targetState.config?.discord;

      const target = resolveDiscordTarget(targetCfg || {});
      if (!target || !targetCfg?.enabled) {
        return res.status(200).json({ ok: false, reason: 'Discord desativado ou sem webhook configurado para este canal.' });
      }

      if (!targetCfg.lastStreams) targetCfg.lastStreams = {};
      const now = Date.now();

      // Deduplicação por session_id (evita reenvio se múltiplos endpoints responderem)
      if (liveSessionId && targetCfg.lastLiveSessionId === liveSessionId) {
        return res.status(200).json({ ok: true, skipped: true, reason: 'Live já notificada para esta sessão (session_id).' });
      }

      // Deduplicação geral por tempo (20 minutos de cooldown)
      const lastPingTime = targetCfg.lastStreams[`${livePlatform}_notified_at`] || targetCfg.lastStreams[`${livePlatform}_ping_time`] || targetCfg.lastNotifiedAt || 0;
      if (now - lastPingTime < 1200000) {
        return res.status(200).json({ ok: true, skipped: true, reason: 'Live já notificada recentemente via app.' });
      }

      let streamData = null;
      let userData = null;

      if (livePlatform === 'twitch') {
        streamData = await getTwitchStream(liveChannel);
        userData = await getTwitchUser(liveChannel);
        if (!streamData) {
          streamData = {
            platform: 'twitch',
            user_name: liveChannel,
            user_login: liveChannel,
            title: liveTitle || 'Transmissão Ao Vivo na Twitch • Alive App',
            game_name: liveGame || 'Just Chatting',
            viewer_count: 1,
            url: `https://twitch.tv/${liveChannel}`,
          };
        }
      } else if (livePlatform === 'kick') {
        streamData = await getKickStream(liveChannel);
        if (!streamData) {
          streamData = {
            platform: 'kick',
            user_name: liveChannel,
            user_login: liveChannel,
            title: liveTitle || 'Transmissão Ao Vivo na Kick • Alive App',
            game_name: liveGame || 'Just Chatting',
            viewer_count: 1,
            url: `https://kick.com/${liveChannel}`,
          };
        }
      } else if (livePlatform === 'youtube') {
        const ytHandle = liveChannel.startsWith('@') ? liveChannel : `@${liveChannel}`;
        streamData = await getYoutubeStream(ytHandle);
        if (!streamData) {
          streamData = {
            platform: 'youtube',
            user_name: ytHandle,
            user_login: ytHandle.replace(/^@/, ''),
            title: liveTitle || 'Transmissão Ao Vivo no YouTube • Alive App',
            game_name: liveGame || 'Gaming',
            viewer_count: null,
            url: `https://youtube.com/${ytHandle}`,
          };
        }
      }

      const payload = buildDiscordPayload({ ...targetCfg, channel: liveChannel, platform: livePlatform }, streamData, userData || {});
      try {
        const hookRes = await sendDiscordWebhook(target, payload);
        if (hookRes?.deduplicated) {
          return res.status(200).json({ ok: true, skipped: true, deduplicated: true, reason: 'Live já notificada recentemente (deduplicação ativa).' });
        }
        targetCfg.lastStreams[livePlatform] = streamData?.id || `app_${now}`;
        targetCfg.lastStreams[`${livePlatform}_notified_at`] = now;
        targetCfg.lastStreams[`${livePlatform}_ping_time`] = now;
        targetCfg.lastNotifiedAt = now;
        if (liveSessionId) targetCfg.lastLiveSessionId = liveSessionId;
        await saveState(targetState, liveChannel);
        return res.status(200).json({ ok: true, notified: true, message: `Live do app Alive (${livePlatform}) notificada com sucesso no Discord!` });
      } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
      }
    }

    return res.status(400).json({ error: 'Ação inválida.' });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Método não permitido' });
}
