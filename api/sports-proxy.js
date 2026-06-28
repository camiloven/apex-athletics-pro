// api/sports-proxy.js — Proxy seguro para api-sports.io
// La API key se guarda como variable de entorno en Vercel

export default async function handler(req, res) {
    // Solo permitir GET
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

    const apiKey = process.env.SPORTS_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'API key no configurada en el servidor' });
    }

    // Obtener parámetros de la query
    const { sport, date } = req.query;
    if (!sport || !date) {
        return res.status(400).json({ error: 'Parámetros requeridos: sport, date' });
    }

    // Mapeo de deportes a endpoints
    const endpoints = {
        soccer: `https://v3.football.api-sports.io/fixtures?date=${date}`,
        basketball: `https://v1.basketball.api-sports.io/games?date=${date}`,
        hockey: `https://v1.hockey.api-sports.io/games?date=${date}`,
        volleyball: `https://v1.volleyball.api-sports.io/games?date=${date}`,
        handball: `https://v1.handball.api-sports.io/games?date=${date}`,
        tennis: `https://v1.tennis.api-sports.io/games?date=${date}`
    };

    const url = endpoints[sport] || endpoints.soccer;

    try {
        const response = await fetch(url, {
            headers: { 'x-apisports-key': apiKey }
        });

        if (!response.ok) {
            return res.status(response.status).json({
                error: `Error de la API externa: ${response.status}`
            });
        }

        const data = await response.json();

        // Cache corto para no repetir llamadas
        res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

        return res.status(200).json({ response: data.response || [] });
    } catch (error) {
        console.error('Error fetching sports data:', error.message);
        return res.status(500).json({ error: 'Error al consultar resultados' });
    }
}
