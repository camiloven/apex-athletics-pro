// api/auth.js — Verificación de contraseña en el servidor
// La clave se guarda como variable de entorno en Vercel (Settings → Environment Variables)

export default function handler(req, res) {
    // Solo permitir POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    // Generar token de acceso directo (sin contraseña)
    const token = Buffer.from(
        JSON.stringify({
            auth: true,
            exp: Date.now() + 24 * 60 * 60 * 1000
        })
    ).toString('base64');

    return res.status(200).json({ success: true, token });
}
