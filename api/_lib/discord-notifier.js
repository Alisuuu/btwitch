// Alive Bot — Notificador e Utilitários de Live para o Discord
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || 'gp762nuuoqcoxypju8c569th9wz7q5';
const TWITCH_TOKEN = (process.env.TWITCH_BOT_TOKEN || 'te78do9otbn9t5ia4lxzr3div72dvg').replace(/^oauth:/i, '').trim();
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || '';
const APP_BASE_URL = (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || 'https://alive-bot-j126.onrender.com').replace(/\/+$/, '');
const DEFAULT_BOT_ICON = `${APP_BASE_URL}/img/ic_splash_logo.webp`;

let cachedClientId = null;
async function getHelixHeaders() {
  if (cachedClientId) {
    return {
      'Client-Id': cachedClientId,
      'Authorization': `Bearer ${TWITCH_TOKEN}`,
    };
  }
  // Se for o token padrão do bot, usa o client_id correspondente
  if (TWITCH_TOKEN === 'te78do9otbn9t5ia4lxzr3div72dvg') {
    cachedClientId = 'gp762nuuoqcoxypju8c569th9wz7q5';
    return {
      'Client-Id': cachedClientId,
      'Authorization': `Bearer ${TWITCH_TOKEN}`,
    };
  }
  // Valida com o endpoint oficial da Twitch para garantir client_id compatível
  try {
    const v = await fetch('https://id.twitch.tv/oauth2/validate', {
      headers: { Authorization: `OAuth ${TWITCH_TOKEN}` },
    });
    if (v.ok) {
      const data = await v.json();
      if (data?.client_id) {
        cachedClientId = data.client_id;
        return {
          'Client-Id': cachedClientId,
          'Authorization': `Bearer ${TWITCH_TOKEN}`,
        };
      }
    }
  } catch {}

  cachedClientId = 'gp762nuuoqcoxypju8c569th9wz7q5';
  return {
    'Client-Id': cachedClientId,
    'Authorization': `Bearer ${TWITCH_TOKEN}`,
  };
}

export async function getTwitchStream(login) {
  const cleanLogin = String(login || '').trim().toLowerCase().replace(/^#/, '');
  if (!cleanLogin) return null;

  try {
    const headers = await getHelixHeaders();
    const res = await fetch(`https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(cleanLogin)}`, {
      headers,
    });

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    if (Array.isArray(data.data) && data.data.length > 0) {
      return data.data[0];
    }
  } catch (err) {
    console.warn('[alive-discord] Falha ao consultar stream Twitch:', err.message);
  }
  return null;
}

export async function getTwitchUser(login) {
  const cleanLogin = String(login || '').trim().toLowerCase().replace(/^#/, '');
  if (!cleanLogin) return null;

  try {
    const headers = await getHelixHeaders();
    const res = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(cleanLogin)}`, {
      headers,
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.data) && data.data.length > 0) {
        return data.data[0];
      }
    }
  } catch {}
  return null;
}

// --- KICK STREAM CHECK ---
export async function getKickStream(slug) {
  const cleanSlug = String(slug || '').trim().toLowerCase().replace(/^@/, '');
  if (!cleanSlug) return null;

  try {
    const res = await fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(cleanSlug)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
      },
    });

    if (!res.ok) return null;
    const data = await res.json();
    const ls = data?.livestream;
    if (ls && ls.id) {
      const streamer = data.user?.username || cleanSlug;
      return {
        platform: 'kick',
        id: String(ls.id),
        user_name: streamer,
        user_login: cleanSlug,
        title: ls.session_title || `Transmissão ao vivo de ${streamer}`,
        game_name: ls.categories?.[0]?.name || 'Just Chatting',
        viewer_count: ls.viewer_count ?? 0,
        thumbnail_url: ls.thumbnail?.url || '',
        profile_image_url: data.user?.profile_pic || '',
        url: `https://kick.com/${cleanSlug}`,
      };
    }
  } catch (err) {
    console.warn('[alive-discord] Falha ao consultar stream Kick:', err.message);
  }
  return null;
}

// --- YOUTUBE STREAM CHECK ---
export async function getYoutubeStream(handleOrChannel) {
  const clean = String(handleOrChannel || '').trim().replace(/^@/, '');
  if (!clean) return null;

  try {
    const url = `https://www.youtube.com/@${encodeURIComponent(clean)}/live`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      redirect: 'follow',
    });

    if (!res.ok) return null;
    const html = await res.text();
    const isLive = html.includes('"isLive":true') || html.includes('"isLiveContent":true') || html.includes('LIVE_NOW');
    if (!isLive) return null;

    const videoIdMatch = html.match(/"videoId":"([^"]+)"/);
    const videoId = videoIdMatch ? videoIdMatch[1] : '';
    if (!videoId) return null;

    const titleMatch = html.match(/"title":"([^"]+)"/);
    const title = titleMatch ? titleMatch[1].replace(/\\u0026/g, '&').replace(/\\"/g, '"') : `Ao Vivo no YouTube • @${clean}`;

    const thumb = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    return {
      platform: 'youtube',
      id: videoId,
      user_name: `@${clean}`,
      user_login: clean,
      title,
      game_name: 'YouTube Live',
      viewer_count: null,
      thumbnail_url: thumb,
      profile_image_url: '',
      url: `https://www.youtube.com/watch?v=${videoId}`,
    };
  } catch (err) {
    console.warn('[alive-discord] Falha ao consultar stream YouTube:', err.message);
  }
  return null;
}

// --- TIKTOK STREAM CHECK ---
export async function getTiktokStream(username) {
  const clean = String(username || '').trim().toLowerCase().replace(/^@/, '');
  if (!clean) return null;

  try {
    const url = `https://www.tiktok.com/@${encodeURIComponent(clean)}/live`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });

    if (!res.ok) return null;
    const html = await res.text();
    const isLive = html.includes('"status":2') || html.includes('"liveRoom":') || html.includes('LIVE_NOW');
    if (!isLive) return null;

    const roomIdMatch = html.match(/"roomId":"([^"]+)"/) || html.match(/"room_id":"([^"]+)"/);
    const roomId = roomIdMatch ? roomIdMatch[1] : `tt_${clean}_${Math.floor(Date.now() / (1000 * 60 * 30))}`;

    const titleMatch = html.match(/"title":"([^"]+)"/);
    const title = titleMatch ? titleMatch[1] : `Ao Vivo no TikTok • @${clean}`;

    return {
      platform: 'tiktok',
      id: roomId,
      user_name: `@${clean}`,
      user_login: clean,
      title,
      game_name: 'TikTok Live',
      viewer_count: null,
      thumbnail_url: '',
      profile_image_url: '',
      url: `https://www.tiktok.com/@${clean}/live`,
    };
  } catch (err) {
    console.warn('[alive-discord] Falha ao consultar stream TikTok:', err.message);
  }
  return null;
}

export function buildDiscordPayload(cfg, streamInfo = {}, userInfo = {}) {
  const platform = String(streamInfo.platform || cfg.platform || 'twitch').toLowerCase();

  let platformLabel = 'Twitch';
  let defaultColor = 0x9146FF; // Roxo Twitch
  let defaultUrl = `https://twitch.tv/${cfg.channel || 'streamer'}`;
  let buttonLabel = 'Assistir na Twitch';

  if (platform === 'youtube') {
    platformLabel = 'YouTube';
    defaultColor = 0xFF0000; // Vermelho YouTube
    defaultUrl = streamInfo.url || `https://youtube.com/@${cfg.channel || 'streamer'}/live`;
    buttonLabel = 'Assistir no YouTube';
  } else if (platform === 'kick') {
    platformLabel = 'Kick';
    defaultColor = 0x53FC18; // Verde Kick
    defaultUrl = streamInfo.url || `https://kick.com/${cfg.channel || 'streamer'}`;
    buttonLabel = 'Assistir na Kick';
  } else if (platform === 'tiktok') {
    platformLabel = 'TikTok';
    defaultColor = 0xFE2C55; // Magenta/Ciano TikTok
    defaultUrl = streamInfo.url || `https://tiktok.com/@${cfg.channel || 'streamer'}/live`;
    buttonLabel = 'Assistir no TikTok';
  }

  const streamer = streamInfo.user_name || userInfo.display_name || cfg.channel || 'Streamer';
  const login = streamInfo.user_login || userInfo.login || cfg.channel || 'streamer';
  const title = streamInfo.title || `[AO VIVO] Transmissão no ${platformLabel}`;
  const game = streamInfo.game_name || (platform === 'twitch' ? 'Just Chatting' : `${platformLabel} Live`);
  const viewers = streamInfo.viewer_count != null ? String(streamInfo.viewer_count) : '-';
  const url = streamInfo.url || defaultUrl;
  const nowTs = new Date().toISOString();

  let mentionText = '';
  if (cfg.mention === 'everyone') mentionText = '@everyone';
  else if (cfg.mention === 'here') mentionText = '@here';
  else if (cfg.mention === 'role' && cfg.roleId) mentionText = `<@&${cfg.roleId}>`;

  let content = cfg.message || `[LIVE] **{streamer}** está ao vivo no ${platformLabel} | **{game}**`;
  content = content
    .replace(/\{streamer\}/gi, streamer)
    .replace(/\{title\}/gi, title)
    .replace(/\{game\}/gi, game)
    .replace(/\{url\}/gi, url)
    .replace(/\{platform\}/gi, platformLabel)
    .replace(/\{viewers\}/gi, viewers);

  if (mentionText && !content.includes(mentionText)) {
    content = `${mentionText} ${content}`;
  }

  let embedColor = defaultColor;
  if (cfg.embedColor && cfg.embedColor !== '#9146FF') {
    const hex = cfg.embedColor.replace(/^#/, '');
    const num = parseInt(hex, 16);
    if (!isNaN(num)) embedColor = num;
  }

  let previewImg = '';
  if (streamInfo.thumbnail_url) {
    previewImg = streamInfo.thumbnail_url.replace('{width}', '1280').replace('{height}', '720');
    if (!previewImg.includes('?')) previewImg += `?t=${Date.now()}`;
  } else if (platform === 'twitch') {
    previewImg = `https://static-cdn.jtvnw.net/previews-ttv/live_user_${login}-1280x720.jpg?t=${Date.now()}`;
  }

  const avatarUrl = streamInfo.profile_image_url || userInfo.profile_image_url || DEFAULT_BOT_ICON;

  const fields = [
    { name: '▸ Categoria', value: game, inline: true },
    { name: '▸ Plataforma', value: platformLabel, inline: true },
    { name: '▸ Status', value: 'Ao vivo agora', inline: true },
  ];
  if (viewers !== '-') {
    fields[1] = { name: '▸ Espectadores', value: viewers, inline: true };
    fields[2] = { name: '▸ Plataforma', value: platformLabel, inline: true };
  }

  const embed = {
    title: (cfg.embedTitle || '▸ {title}')
      .replace(/\{streamer\}/gi, streamer)
      .replace(/\{title\}/gi, title)
      .replace(/\{game\}/gi, game)
      .replace(/\{platform\}/gi, platformLabel),
    url,
    description: (cfg.embedDesc || `Transmissão iniciada no ${platformLabel}. Venha interagir no chat!`)
      .replace(/\{streamer\}/gi, streamer)
      .replace(/\{title\}/gi, title)
      .replace(/\{game\}/gi, game)
      .replace(/\{platform\}/gi, platformLabel),
    color: embedColor,
    author: {
      name: `${streamer} • Ao Vivo no ${platformLabel}`,
      url,
      icon_url: avatarUrl,
    },
    fields,
    footer: {
      text: `Alive Bot • Notificação de Live (${platformLabel})`,
      icon_url: DEFAULT_BOT_ICON,
    },
    timestamp: nowTs,
  };

  if (cfg.includeThumbnail !== false && previewImg) {
    embed.image = { url: previewImg };
  }
  if (avatarUrl) {
    embed.thumbnail = { url: avatarUrl };
  }

  const components = [
    {
      type: 1, // Action Row
      components: [
        {
          type: 2, // Button
          style: 5, // Link (URL)
          label: buttonLabel,
          url,
        },
      ],
    },
  ];

  return {
    content,
    username: 'Alive Bot',
    avatar_url: DEFAULT_BOT_ICON,
    embeds: [embed],
    components,
  };
}

export async function sendDiscordWebhook(target, payload) {
  const cleanTarget = String(target || '').trim();
  if (!cleanTarget) {
    throw new Error('Canal ou Webhook do Discord não configurado.');
  }

  // Se for URL de Webhook do Discord
  if (cleanTarget.startsWith('https://discord.com/api/webhooks/') || cleanTarget.startsWith('https://discordapp.com/api/webhooks/')) {
    const res = await fetch(cleanTarget, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Discord retornou erro HTTP ${res.status}: ${text}`);
    }
    return true;
  }

  // Se for ID numérico de canal do Discord
  if (/^\d{17,21}$/.test(cleanTarget)) {
    const botToken = DISCORD_BOT_TOKEN;
    if (!botToken) {
      throw new Error('Para enviar diretamente pelo ID do canal, defina DISCORD_BOT_TOKEN no servidor, ou utilize o link do Webhook.');
    }

    const res = await fetch(`https://discord.com/api/v10/channels/${cleanTarget}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bot ${botToken.replace(/^Bot\s+/i, '').trim()}`,
      },
      body: JSON.stringify({
        content: payload.content,
        embeds: payload.embeds,
        components: payload.components,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (res.status === 403) {
        throw new Error('O bot AliveBot não tem permissão para postar no canal selecionado. Ative a permissão "Enviar Mensagens" e "Inserir Links" para o cargo AliveBot nas configurações do canal no Discord, ou utilize o link do Webhook.');
      }
      throw new Error(`Discord API erro HTTP ${res.status}: ${text}`);
    }
    return true;
  }

  throw new Error('Endereço inválido. Cole a URL do Webhook do Discord ou o ID numérico do canal.');
}

export async function getDiscordBotGuilds(tokenOverride) {
  const token = (tokenOverride || DISCORD_BOT_TOKEN || '').trim().replace(/^Bot\s+/i, '');
  if (!token) return { ok: false, error: 'DISCORD_BOT_TOKEN_MISSING' };
  try {
    const res = await fetch('https://discord.com/api/v10/users/@me/guilds', {
      headers: { Authorization: `Bot ${token}` },
    });
    if (!res.ok) {
      const errTxt = await res.text().catch(() => '');
      return { ok: false, error: `Discord HTTP ${res.status}: ${errTxt}` };
    }
    const list = await res.json();
    return { ok: true, guilds: list };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function getDiscordGuildChannels(guildId, tokenOverride) {
  const token = (tokenOverride || DISCORD_BOT_TOKEN || '').trim().replace(/^Bot\s+/i, '');
  if (!token) return { ok: false, error: 'DISCORD_BOT_TOKEN_MISSING' };
  if (!guildId) return { ok: false, error: 'GUILD_ID_MISSING' };
  try {
    const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
      headers: { Authorization: `Bot ${token}` },
    });
    if (!res.ok) {
      const errTxt = await res.text().catch(() => '');
      return { ok: false, error: `Discord HTTP ${res.status}: ${errTxt}` };
    }
    const list = await res.json();
    const textChannels = list
      .filter((c) => c.type === 0 || c.type === 5)
      .map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        position: c.position,
      }))
      .sort((a, b) => a.position - b.position);
    return { ok: true, channels: textChannels };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
