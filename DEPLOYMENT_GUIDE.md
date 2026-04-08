# Guía de Deployment - MusicMasiveDownload

## Estado Actual

✅ **Frontend (Vercel)**: Deployado en https://music-masive-download.vercel.app  
❌ **Backend (Railway)**: No operacional - `404 Application not found`

## Cambios Realizados

### 1. Arreglos de Seguridad
- ✅ Resolvida vulnerabilidad en `path-to-regexp` (npm audit fix)
- ✅ Rate limiting configurado (300 info/15min, 150 download/15min por IP)
- ✅ Headers de seguridad (CSP, HSTS, X-Frame-Options, etc.)
- ✅ Sanitización de URLs y validación de formatos

### 2. Cambios de Configuración
- ✅ `vercel.json`: Removida rewrite hardcodeada a URL muerta
- ✅ `src/store/useStore.js`: Frontend ahora usa variables de ambiente para API URLs
- ✅ `public/sw.js`: Service Worker v3 con network-first para navegación

### 3. Cambios en Backend
- ✅ `server/utils/ytdlp.js`: Agregada exportación de `getDirectUrl()` (faltaba)
- ✅ `server/index.js`: Health endpoint, rate limiters, timeout 5min
- ✅ `server/routes/download.js`: Rutas para info, download, playlist

## Próximos Pasos - CRÍTICO

### Paso 1: Desplegar Backend a Railway

#### Opción A: Nuevo Proyecto Railway (Recomendado)

1. **Crear Cuenta en Railway** (si no tienes)
   - Ir a https://railway.app
   - Sign up con GitHub

2. **Crear Nuevo Proyecto**
   - Dashboard → New Project → Deploy from GitHub
   - Seleccionar repositorio `MusicMasiveDownload`
   - Seleccionar carpeta `server/` como root

3. **Configurar Variables de Ambiente**
   - En Railway Dashboard → Settings → Environment
   - (Por ahora no hay variables requeridas si Instagram cookies no son necesarias)
   - Si necesitas Instagram: `INSTAGRAM_COOKIES_BASE64=<tu-valor>`

4. **Obtener URL del Backend**
   - Cuando Railway finalice el deploy, obtenerás una URL como:
     `https://XXXX.up.railway.app`
   - **COPIA ESTA URL** - la necesitarás en el siguiente paso

5. **Configurar Vercel**
   - Ir a https://vercel.com → Tu Proyecto → Settings → Environment Variables
   - Agregar/actualizar:
     - `VITE_API_URL=https://XXXX.up.railway.app` (reemplazar XXXX con tu URL)
     - `VITE_DOWNLOAD_API_URL=https://XXXX.up.railway.app`
   - Triggerear redeploy en Vercel

6. **Validar Deployment**
   ```bash
   # Verificar backend (reemplazar XXXX con tu URL)
   curl https://XXXX.up.railway.app/api/health
   
   # Debe responder con:
   # {"status":"ok","timestamp":"...","downloads":{...},"uptime":...}
   ```

### Paso 2: Validar Frontend-Backend Comunicación

1. **Limpiar Cache del Navegador**
   - `Ctrl+Shift+Delete` → Clear all time
   - O: Visit `https://music-masive-download.vercel.app?nocache=1`

2. **Probar Endpoints**
   - Abre DevTools (F12) → Network tab
   - Ingresa URL de YouTube/Instagram/TikTok
   - Deber ver requests a `/api/info` exitosos (200)

3. **Probar Descarga Completa**
   - Selecciona video y formato
   - Clickea descargar
   - Verifica que descarga sin errores

## Troubleshooting

### "Backend unavailable" Error
- Verifica que Railway URL sea correcta en Vercel environment variables
- Verifica que el Railway deployment haya terminado (check dashboard)
- Test URL directamente: `https://XXXX.up.railway.app/api/health`

### 502 / Timeout Errors
- El backend puede estar sobrecargado (max 10 concurrent yt-dlp)
- Espera 30 segundos e intenta de nuevo
- Si persiste, reinicia el proyecto en Railway Dashboard

### CORS Errors en Console
- El backend tiene CORS configurado para Vercel
- Si cambias backend URL, asegúrate que CORS esté permitiendo esa origin

## Commits Realizados

- `1e9a205`: fix: Resolve high severity vulnerability in path-to-regexp
- `d3cc55a`: refactor: Remove hardcoded Railway URL from vercel.json

## Verificación Local

El backend fue testeado localmente y funciona correctamente:

```bash
cd server
npm install
node index.js
# Server running on port 4000

# En otra terminal:
curl http://localhost:4000/api/health
# ✅ Status: ok
```

## Entorno de Desarrollo

Para desarrollar localmente:

```bash
# Terminal 1 - Frontend
npm run dev

# Terminal 2 - Backend
cd server
npm run dev

# Variables de ambiente (opcional):
# export VITE_API_URL=http://localhost:4000
# export VITE_DOWNLOAD_API_URL=http://localhost:4000
```

**IMPORTANTE**: El proyecto requiere que el backend esté deployado en Railway para que funcione en producción (Vercel + Railway).

---

¿Necesitas ayuda con alguno de estos pasos? El deployment a Railway es el paso crítico que falta.
