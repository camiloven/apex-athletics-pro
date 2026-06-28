// api/auth.js — Verificación de contraseña en el servidor
// La clave se guarda como variable de entorno en Vercel (Settings → Environment Variables)

export default function handler(req, res) {
    // Solo permitir POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    const { password } = req.body || {};
    const serverPassword = process.env.APP_PASSWORD;

    if (!serverPassword) {
        console.error('APP_PASSWORD no configurada en variables de entorno');
        return res.status(500).json({ error: 'Error de configuración del servidor' });
    }

    if (!password || typeof password !== 'string') {
        return res.status(400).json({ error: 'Contraseña requerida' });
    }

    // Comparación simple (para producción considerar bcrypt)
    if (password.trim() === serverPassword) {
        // Generar un token simple con expiración (24h)
        const token = Buffer.from(
            JSON.stringify({
                auth: true,
                exp: Date.now() + 24 * 60 * 60 * 1000
            })
        ).toString('base64');

        return res.status(200).json({ success: true, token });
    }

    return res.status(401).json({ error: 'Clave incorrecta' });
}
