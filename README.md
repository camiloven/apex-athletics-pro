# Apex Athletics Pro

**Plataforma Premium de Pronósticos Deportivos con IA**  
by CamiloVen

---

## Características

- Interfaz moderna y responsive (hecha con Tailwind)
- Sistema de subida de archivos Excel (.xlsx) para tus pronósticos
- 5 pestañas principales:
  - **Pronos** — Lista de partidos con predicciones
  - **Resultados** — Resultados reales + comparación con tu pronóstico
  - **Análisis** — Oracle v4.3 (IA integrada)
  - **Fuentes** — Integración con APIs externas
  - **Config** — Personalización de la IA
- Soporte para múltiples deportes (Fútbol, Tenis, Baloncesto, Hockey, etc.)
- Renderizado inteligente de tarjetas con mejores predicciones destacadas
- Sistema de cache para resultados

## Tecnologías usadas

- HTML5 + TailwindCSS
- JavaScript modular (ES6+)
- XLSX (librería para Excel)
- Mammoth.js (lectura de archivos Word)
- Vercel Serverless Functions (backend seguro)
- GitHub (control de versiones)

## Arquitectura

```
├── index.html          ← Punto de entrada (limpio, sin JS inline)
├── styles.css          ← Estilos separados
├── app.js              ← Lógica principal de la aplicación
├── api/
│   ├── auth.js         ← Autenticación serverless (POST /api/auth)
│   └── sports-proxy.js ← Proxy seguro para api-sports.io
├── vercel.json         ← Configuración de rutas y headers
├── intro-video.mp4     ← Video de intro
└── README.md
```

## Seguridad

### Antes (v1)
- ❌ Contraseña hardcodeada en el HTML (`const SECRET_PASSWORD="tuclave123"`)
- ❌ API key de api-sports.io expuesta en el frontend
- ❌ Todo el código en un solo archivo de 45KB

### Ahora (v2)
- ✅ Autenticación serverless (`/api/auth`) — la contraseña vive en variables de entorno de Vercel
- ✅ API key protegida — las llamadas a api-sports.io pasan por un proxy serverless (`/api/sports-proxy`)
- ✅ Código separado en archivos modulares (HTML, CSS, JS)
- ✅ Manejo de errores y validación de datos
- ✅ Tokens con expiración (24h)

## Despliegue

### 1. Configurar variables de entorno en Vercel

Ve a tu proyecto en Vercel → **Settings → Environment Variables** y agrega:

| Variable | Descripción |
|---|---|
| `APP_PASSWORD` | Contraseña de acceso a la app |
| `SPORTS_API_KEY` | Tu API key de api-sports.io |

### 2. Desplegar

```bash
# Instalar Vercel CLI (si no lo tienes)
npm i -g vercel

# Desplegar
vercel --prod
```

O simplemente hacer push a GitHub si tu proyecto ya está conectado a Vercel.

### 3. Claves de IA (en el navegador)

Los usuarios ingresan sus propias claves de Groq y Gemini desde la pestaña **⚙️ Config**. Estas se guardan solo en el localStorage del dispositivo.

## Licencia

Este proyecto es de uso personal y comercial libre.
