import { Router } from 'express'
import { Readable } from 'stream'
import { getVideoInfo, downloadMedia, getDirectUrl } from '../utils/ytdlp.js'

const router = Router()

// Maximum URL length to prevent abuse
const MAX_URL_LENGTH = 2048

// Allowed quality values per format
const ALLOWED_AUDIO_QUALITIES = ['128', '192', '256', '320']
const ALLOWED_VIDEO_QUALITIES = ['360', '480', '720', '1080', '1440', '2160']

// Supported platform hostnames
const SUPPORTED_HOSTS = [
  'youtube.com', 'youtu.be', 'www.youtube.com', 'm.youtube.com',
  'facebook.com', 'www.facebook.com', 'fb.watch', 'm.facebook.com', 'web.facebook.com',
  'instagram.com', 'www.instagram.com',
  'tiktok.com', 'www.tiktok.com', 'vm.tiktok.com',
]

// ─── Shared Validation ───────────────────────────────────────────────────
function isValidUrl(url) {
  if (!url || typeof url !== 'string' || url.length > MAX_URL_LENGTH) return false
  try {
    const u = new URL(url)
    if (!['http:', 'https:'].includes(u.protocol)) return false
    return SUPPORTED_HOSTS.some(h => u.hostname === h || u.hostname.endsWith('.' + h))
  } catch {
    return false
  }
}

function sanitizeTitle(raw) {
  if (!raw || typeof raw !== 'string') return 'download'
  return raw
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/[\/\\:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
    || 'download'
}

// ─── Shared POST handler for /info ───────────────────────────────────────
async function handleInfo(req, res) {
  const incomingUrl = req.body?.url

  // Debug logging
  console.log(`[POST /api/info] Incoming URL: ${incomingUrl || '(missing)'}`)

  if (!incomingUrl) {
    console.warn('[POST /api/info] 400 — URL is required')
    return res.status(400).json({ error: 'URL is required' })
  }

  if (!isValidUrl(incomingUrl)) {
    console.warn(`[POST /api/info] 400 — Invalid URL: ${incomingUrl.slice(0, 80)}`)
    return res.status(400).json({ error: 'URL no válida. Plataformas soportadas: YouTube, Facebook, Instagram, TikTok.' })
  }

  try {
    const info = await getVideoInfo(incomingUrl)
    console.log(`[POST /api/info] 200 — "${info.title || 'unknown'}" (${info.duration}s)`)
    // ✅ Fix 6 — HTTP cache headers to reduce redundant requests
    res.set('Cache-Control', 'public, max-age=180, stale-while-revalidate=30')
    res.set('ETag', `"${Buffer.from(incomingUrl).toString('base64url')}"`)
    res.json(info)
  } catch (error) {
    console.error('[POST /api/info] 500 —', error.message)

    // Better error messages
    let userMessage = 'No se pudo obtener información del video'
    if (error.message?.includes('yt-dlp') || error.message?.includes('ENOENT')) {
      userMessage = 'Herramienta de descarga no disponible. Contacta al administrador.'
    } else if (error.message?.includes('timeout') || error.message?.includes('timed out')) {
      userMessage = 'La solicitud tardó demasiado. Verifica que el video sea público e intenta de nuevo.'
    }

    // Dev mode: include stack trace
    const isDev = process.env.NODE_ENV === 'development'
    res.status(500).json({
      error: userMessage,
      ...(isDev && { message: error.message, stack: error.stack }),
    })
  }
}

// ─── Shared POST handler for /download ───────────────────────────────────
async function handleDownload(req, res) {
  const { url, format = 'mp3', quality = '192', title = '' } = req.body || {}

  // Debug logging
  console.log(`[POST /api/download] Incoming: url=${url || '(missing)'}, format=${format}, quality=${quality}, title=${title || '(auto)'}`)

  if (!url) {
    console.warn('[POST /api/download] 400 — URL is required')
    return res.status(400).json({ error: 'URL is required' })
  }

  if (!isValidUrl(url)) {
    console.warn(`[POST /api/download] 400 — Invalid URL: ${url.slice(0, 80)}`)
    return res.status(400).json({ error: 'URL no válida. Plataformas soportadas: YouTube, Facebook, Instagram, TikTok.' })
  }

  if (!['mp3', 'mp4'].includes(format)) {
    console.warn(`[POST /api/download] 400 — Invalid format: ${format}`)
    return res.status(400).json({ error: 'Formato no soportado. Usa mp3 o mp4.' })
  }

  // SECURITY: Validate quality
  const allowedQualities = format === 'mp3' ? ALLOWED_AUDIO_QUALITIES : ALLOWED_VIDEO_QUALITIES
  const safeQuality = allowedQualities.includes(quality) ? quality : (format === 'mp3' ? '192' : '720')
  const safeTitle = sanitizeTitle(title)

  // ─── FAST PATH: Streaming proxy for MP4 ─────────────────────────────
  if (format === 'mp4') {
    try {
      console.log(`[POST /api/download] Attempting stream proxy for MP4...`)
      const result = await getDirectUrl(url, format, safeQuality)
      if (result) {
        const { directUrl } = result
        const controller = new AbortController()
        const fetchTimeout = setTimeout(() => controller.abort(), 300000)

        const cdnRes = await fetch(directUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          },
          signal: controller.signal,
        })

        if (cdnRes.ok && cdnRes.body) {
          const contentLength = cdnRes.headers.get('content-length')
          if (contentLength) res.setHeader('Content-Length', contentLength)
          const mp4Filename = `${safeTitle}.mp4`
          res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(mp4Filename)}"; filename*=UTF-8''${encodeURIComponent(mp4Filename)}`)
          res.setHeader('Content-Type', 'video/mp4')
          res.setHeader('X-Content-Type-Options', 'nosniff')

          console.log(`[POST /api/download] 200 — Streaming MP4: "${mp4Filename}"`)

          const nodeStream = Readable.fromWeb(cdnRes.body)

          // ✅ FIX 3 — Register error/close handlers BEFORE pipe to ensure proper cleanup
          nodeStream.on('error', (err) => {
            clearTimeout(fetchTimeout)
            console.error('[stream-proxy] Stream error:', err.message)
            if (!res.headersSent) res.status(500).json({ error: 'Error en streaming' })
          })

          req.on('close', () => {
            clearTimeout(fetchTimeout)
            if (!res.writableFinished) {
              nodeStream.destroy()
              controller.abort()
            }
          })

          res.on('finish', () => {
            clearTimeout(fetchTimeout)
            nodeStream.destroy() // ✅ Ensure source stream is always destroyed
            console.log(`[stream-proxy] Finished: "${mp4Filename}"`)
          })

          nodeStream.pipe(res)
          return
        }
        clearTimeout(fetchTimeout)
        console.log('[stream-proxy] CDN response not ok, falling back to disk')
      } else {
        console.log('[stream-proxy] getDirectUrl returned null, falling back to disk')
      }
    } catch (streamErr) {
      console.log('[stream-proxy] Falling back to disk download:', streamErr.message)
    }
  }

  // ─── FALLBACK: Disk-based download ──────────────────────────────────
  try {
    const { filePath, filename, mimeType } = await downloadMedia(url, format, safeQuality, safeTitle)

    const { statSync } = await import('fs')
    const stat = statSync(filePath)
    res.setHeader('Content-Length', stat.size)
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`)
    res.setHeader('Content-Type', mimeType)
    res.setHeader('X-Content-Type-Options', 'nosniff')

    console.log(`[POST /api/download] 200 — Sending file: "${filename}" (${Math.round(stat.size / 1024 / 1024)}MB)`)

    const { createReadStream } = await import('fs')
    const stream = createReadStream(filePath)

    const cleanup = async () => {
      try {
        const { unlink } = await import('fs/promises')
        await unlink(filePath)
      } catch (e) {
        if (e.code !== 'ENOENT') console.error('Cleanup error:', e.message)
      }
    }

    stream.pipe(res)
    stream.on('end', cleanup)

    req.on('close', () => {
      if (!res.writableFinished) {
        stream.destroy()
        cleanup()
      }
    })

    stream.on('error', (err) => {
      console.error('Stream error:', err.message)
      cleanup()
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error al enviar el archivo' })
      }
    })
  } catch (error) {
    console.error('[POST /api/download] 500 —', error.message)
    const isDev = process.env.NODE_ENV === 'development'
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Error en la descarga',
        ...(isDev && { message: error.message, stack: error.stack }),
      })
    }
  }
}

// ─── Shared POST handler for /playlist ───────────────────────────────────
async function handlePlaylist(req, res) {
  const incomingUrl = req.body?.url

  console.log(`[POST /api/playlist] Incoming URL: ${incomingUrl || '(missing)'}`)

  if (!incomingUrl) {
    console.warn('[POST /api/playlist] 400 — URL is required')
    return res.status(400).json({ error: 'URL is required' })
  }

  if (!isValidUrl(incomingUrl)) {
    console.warn(`[POST /api/playlist] 400 — Invalid URL: ${incomingUrl.slice(0, 80)}`)
    return res.status(400).json({ error: 'URL no válida. Plataformas soportadas: YouTube, Facebook, Instagram, TikTok.' })
  }

  try {
    const info = await getVideoInfo(incomingUrl, true)
    console.log(`[POST /api/playlist] 200 — ${info.count || 0} videos`)
    res.json(info)
  } catch (error) {
    console.error('[POST /api/playlist] 500 —', error.message)
    const isDev = process.env.NODE_ENV === 'development'
    res.status(500).json({
      error: 'No se pudo obtener la playlist',
      ...(isDev && { message: error.message, stack: error.stack }),
    })
  }
}

// ─── POST Routes (primary) ──────────────────────────────────────────────
router.post('/info', handleInfo)
router.post('/download', handleDownload)
router.post('/playlist', handlePlaylist)

// ─── GET Routes (compatibility / debugging only) ────────────────────────
// These delegate to the same handlers by wrapping req.query into req.body.
// Only enabled when NODE_ENV !== 'production' to prevent accidental abuse.
// Set ENABLE_GET_COMPATIBILITY=1 to enable in production if needed.

const enableGetCompat = process.env.NODE_ENV !== 'production' || process.env.ENABLE_GET_COMPATIBILITY === '1'

if (enableGetCompat) {
  console.log('[compat] GET endpoints enabled for /info, /download, /playlist')

  router.get('/info', (req, res) => {
    console.log(`[GET /api/info] Debug mode — query URL: ${req.query.url || '(missing)'}`)
    req.body = { url: req.query.url }
    return handleInfo(req, res)
  })

  router.get('/download', (req, res) => {
    console.log(`[GET /api/download] Debug mode — query: url=${req.query.url}, format=${req.query.format}, quality=${req.query.quality}`)
    req.body = { url: req.query.url, format: req.query.format || 'mp3', quality: req.query.quality || '192', title: req.query.title || '' }
    return handleDownload(req, res)
  })

  router.get('/playlist', (req, res) => {
    console.log(`[GET /api/playlist] Debug mode — query URL: ${req.query.url || '(missing)'}`)
    req.body = { url: req.query.url }
    return handlePlaylist(req, res)
  })
} else {
  console.log('[compat] GET endpoints disabled (production mode)')
}

export default router
