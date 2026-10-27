// POST /api/twitch/user {token, clientId} -> {login, display_name, id, profile_image_url}
// Valida o token contra a API da Twitch e descobre a conta autenticada.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method not allowed' });
  }

  const token = String(req.body?.token || '').replace(/^oauth:/i, '').trim();
  const clientId = String(req.body?.clientId || process.env.TWITCH_CLIENT_ID || '04ajnvlju5loqchkmzfl7v622veib6').trim();
  if (!token) return res.status(400).json({ error: 'token ausente' });

  try {
    // 1. Valida o token contra o Twitch ID (funciona para qualquer escopo de token, inclusive IRC puro)
    let login = '';
    let userId = '';
    let validatedClientId = clientId;

    try {
      const valRes = await fetch('https://id.twitch.tv/oauth2/validate', {
        headers: { authorization: `OAuth ${token}` },
      });
      if (valRes.ok) {
        const valData = await valRes.json();
        if (valData && valData.login) {
          login = String(valData.login).trim().toLowerCase();
          userId = String(valData.user_id || login);
          if (valData.client_id) validatedClientId = valData.client_id;
        }
      }
    } catch (valErr) {
      console.warn('[alive api/twitch] validate erro:', valErr.message);
    }

    // 2. Se oauth2/validate não retornou login, tenta a Helix users
    let display_name = login;
    let profile_image_url = '';

    if (validatedClientId) {
      try {
        const helixUrl = login
          ? `https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`
          : 'https://api.twitch.tv/helix/users';
        const hr = await fetch(helixUrl, {
          headers: { authorization: `Bearer ${token}`, 'client-id': validatedClientId },
        });
        if (hr.ok) {
          const hj = await hr.json();
          const u = hj?.data?.[0];
          if (u) {
            login = u.login || login;
            userId = u.id || userId;
            display_name = u.display_name || login;
            profile_image_url = u.profile_image_url || '';
          }
        }
      } catch (err) {
        console.warn('[alive api/twitch] helix users erro:', err.message);
      }
    }

    if (!login) {
      console.warn('[alive api/twitch] falha ao extrair login do token');
      return res.status(401).json({ error: 'Token inválido ou expirado na Twitch.' });
    }

    console.log(`[alive api/twitch] SUCESSO: conta identificada @${login} (id: ${userId})`);

    return res.status(200).json({
      login,
      display_name: display_name || login,
      id: userId || login,
      profile_image_url: profile_image_url || ''
    });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
