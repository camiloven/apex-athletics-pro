// api/fd-org-proxy.js — Proxy seguro para football-data.org
// La API key se guarda como variable de entorno en Vercel

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    // Verificar token de autenticación
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No autorizado' });
    }

    try {
        const tokenData = JSON.parse(
            Buffer.from(authHeader.split(' ')[1], 'base64').toString()
        );
        if (!tokenData.auth || tokenData.exp < Date.now()) {
            return res.status(401).json({ error: 'Token expirado o inválido' });
        }
    } catch {
        return res.status(401).json({ error: 'Token inválido' });
    }

    const apiKey = process.env.FD_ORG_KEY;
    if (!apiKey) {
        return res.status(200).json({ response: [], debug: 'FD_ORG_KEY no configurada en Vercel Environment Variables' });
    }

    const { dateFrom, dateTo } = req.query;
    if (!dateFrom || !dateTo) {
        return res.status(200).json({ response: [], debug: 'Faltan parámetros dateFrom o dateTo' });
    }

    const url = `https://api.football-data.org/v4/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`;

    try {
        const response = await fetch(url, {
            headers: { 'X-Auth-Token': apiKey }
        });

        if (response.status === 429) {
            return res.status(200).json({ response: [], debug: 'Rate limit football-data.org' });
        }

        if (!response.ok) {
            return res.status(200).json({ response: [], debug: `football-data.org HTTP ${response.status}` });
        }

        const data = await response.json();

        res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
        return res.status(200).json({ response: data.matches || [] });
    } catch (error) {
        return res.status(200).json({ response: [], debug: 'Error fd.org proxy: ' + error.message });
    }
}
