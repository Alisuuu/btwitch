// Alive Bot — Health check endpoint para monitoramento 24/7 (Render / UptimeRobot / Pingers)
import { botService } from './_lib/irc-bot.js';
import { discordGateway } from './_lib/discord-gateway.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const discordStatus = discordGateway?.connected ? 'online' : (discordGateway ? 'connecting' : 'disabled');
  const botStatus = botService?.connected ? 'online' : (botService?.running ? 'connecting' : 'offline');

  return res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    bot: {
      nick: botService?.nick || 'alivebot1',
      status: botStatus,
      channels: botService ? Array.from(botService.channels) : [],
    },
    discord: {
      status: discordStatus,
      botUser: discordGateway?.user?.username || 'Alive Bot',
    },
  });
}
