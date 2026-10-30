// Alive Bot — Notificador e Utilitários de Live para o Discord
// O token da Twitch vem SEMPRE do ambiente (TWITCH_BOT_TOKEN) — nada hardcoded.
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || 'gp762nuuoqcoxypju8c569th9wz7q5';
const TWITCH_TOKEN = (process.env.TWITCH_BOT_TOKEN || '').replace(/^oauth:/i, '').trim();
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || '';

let cachedClientId = null;
async function getHelixHeaders() {
  if (cachedClientId) {
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

export function buildDiscordPayload(cfg, streamInfo = {}, userInfo = {}) {
  const streamer = streamInfo.user_name || userInfo.display_name || cfg.channel || 'Streamer';
  const login = streamInfo.user_login || userInfo.login || cfg.channel || 'streamer';
  const title = streamInfo.title || '[AO VIVO] Transmissão na Twitch';
  const game = streamInfo.game_name || 'Just Chatting';
  const viewers = String(streamInfo.viewer_count ?? '0');
  const url = `https://twitch.tv/${login}`;
  const nowTs = new Date().toISOString();

  let mentionText = '';
  if (cfg.mention === 'everyone') mentionText = '@everyone';
  else if (cfg.mention === 'here') mentionText = '@here';
  else if (cfg.mention === 'role' && cfg.roleId) mentionText = `<@&${cfg.roleId}>`;

  let content = cfg.message || '[LIVE] **{streamer}** está ao vivo na Twitch | **{game}**';
  content = content
    .replace(/\{streamer\}/gi, streamer)
    .replace(/\{title\}/gi, title)
    .replace(/\{game\}/gi, game)
    .replace(/\{url\}/gi, url)
    .replace(/\{viewers\}/gi, viewers);

  if (mentionText && !content.includes(mentionText)) {
    content = `${mentionText} ${content}`;
  }

  let embedColor = 0x9146FF; // Roxo Twitch padrão
  if (cfg.embedColor) {
    const hex = cfg.embedColor.replace(/^#/, '');
    const num = parseInt(hex, 16);
    if (!isNaN(num)) embedColor = num;
  }

  const thumbTemplate = streamInfo.thumbnail_url || `https://static-cdn.jtvnw.net/previews-ttv/live_user_${login}-{width}x{height}.jpg`;
  const previewImg = thumbTemplate.replace('{width}', '1280').replace('{height}', '720') + `?t=${Date.now()}`;
  const avatarUrl = userInfo.profile_image_url || 'https://btwitch.vercel.app/img/ic_splash_logo.webp';

  const embed = {
    title: (cfg.embedTitle || '▸ {title}')
      .replace(/\{streamer\}/gi, streamer)
      .replace(/\{title\}/gi, title)
      .replace(/\{game\}/gi, game),
    url,
    description: (cfg.embedDesc || 'Transmissão iniciada. Venha interagir no chat e pedir músicas.')
      .replace(/\{streamer\}/gi, streamer)
      .replace(/\{title\}/gi, title)
      .replace(/\{game\}/gi, game),
    color: embedColor,
    author: {
      name: `${streamer} • Ao Vivo na Twitch`,
      url,
      icon_url: avatarUrl,
    },
    fields: [
      { name: '▸ Categoria', value: game, inline: true },
      { name: '▸ Espectadores', value: viewers, inline: true },
      { name: '▸ Status', value: 'Ao vivo agora', inline: true },
    ],
    footer: {
      text: 'Alive Bot • Notificação de Live',
      icon_url: 'https://btwitch.vercel.app/img/ic_splash_logo.webp',
    },
    timestamp: nowTs,
  };

  if (cfg.includeThumbnail !== false) {
    embed.image = { url: previewImg };
  }
  if (avatarUrl) {
    embed.thumbnail = { url: avatarUrl };
  }

  // Botão interativo do Discord para abrir a live diretamente
  const components = [
    {
      type: 1, // Action Row
      components: [
        {
          type: 2, // Button
          style: 5, // Link (URL)
          label: 'Assistir Live',
          url,
        },
      ],
    },
  ];

  return {
    content,
    username: 'Alive Bot',
    avatar_url: 'https://btwitch.vercel.app/img/ic_splash_logo.webp',
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
