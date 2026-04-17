import { Router } from 'express'
import { getVideoInfo, downloadMedia } from '../utils/ytdlp.js'

const router = Router()

const MAX_URL_LENGTH = 2048
const ALLOWED_AUDIO_QUALITIES = ['128', '192', '256', '320']
const ALLOWED_VIDEO_QUALITIES = ['360', '480', '720', '1080', '1440', '2160']

const SUPPORTED_HOSTS = [
  'youtube.com', 'youtu.be', 'www.youtube.com', 'm.youtube.com',
  'facebook.com', 'www.facebook.com', 'fb.watch', 'm.facebook.com', 'web.facebook.com',
  'instagram.com', 'www.instagram.com',
  'tiktok.com', 'www.tiktok.com', 'vm.tiktok.com',
]

function isValidUrl(url) {
  if (!url || typeof url !== 'string' || url.length > MAX_URL_LENGTH) return false
  try {
    const u = new URL(url)
    if (!['http:', 'https:'].includes(u.protocol)) return false
    return SUPPORTED_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`))
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

router.get('/info', (req, res) => {
  console.warn('[GET /api/info] 405 - Method Not Allowed')
  return res.status(405).json({ error: 'Use POST method' })
})

async function handleInfo(req, res) {
  const incomingUrl = req.body?.url

  if (!incomingUrl) {
    console.warn('[POST /api/info] 400 - URL is required')
    return res.status(400).json({ error: 'URL is required' })
  }

  const url = incomingUrl.trim()

  console.log(`[POST /api/info] Incoming URL: ${url || '(missing)'}`)

  if (!isValidUrl(url)) {
    console.warn(`[POST /api/info] 400 - Invalid URL: ${url.slice(0, 80)}`)
    return res.status(400).json({ error: 'URL no valida. Plataformas soportadas: YouTube, Facebook, Instagram, TikTok.' })
  }

  try {
    const info = await getVideoInfo(url)
    res.set('Cache-Control', 'public, max-age=180, stale-while-revalidate=30')
    res.set('ETag', `"${Buffer.from(url).toString('base64url')}"`)
    res.json(info)
  } catch (error) {
    console.error('[POST /api/info] 500 -', error.message)
    res.status(500).json({
      error: 'No se pudo obtener informacion del video',
      message: error.message,
    })
  }
}

async function handleDownload(req, res) {
  const { url, format = 'mp3', quality = '192', title = '' } = req.body || {}

  if (!url) {
    console.warn('[POST /api/download] 400 - URL is required')
    return res.status(400).json({ error: 'URL is required' })
  }

  if (!isValidUrl(url)) {
    console.warn(`[POST /api/download] 400 - Invalid URL: ${url.slice(0, 80)}`)
    return res.status(400).json({ error: 'URL no valida. Plataformas soportadas: YouTube, Facebook, Instagram, TikTok.' })
  }

  if (!['mp3', 'mp4'].includes(format)) {
    console.warn(`[POST /api/download] 400 - Invalid format: ${format}`)
    return res.status(400).json({ error: 'Formato no soportado. Usa mp3 o mp4.' })
  }

  const allowedQualities = format === 'mp3' ? ALLOWED_AUDIO_QUALITIES : ALLOWED_VIDEO_QUALITIES
  const safeQuality = allowedQualities.includes(quality) ? quality : (format === 'mp3' ? '192' : '720')
  const safeTitle = sanitizeTitle(title)

  try {
    const { filePath, filename, mimeType } = await downloadMedia(url, format, safeQuality, safeTitle)
    const { statSync, createReadStream } = await import('fs')

    const stat = statSync(filePath)
    res.setHeader('Content-Length', stat.size)
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`)
    res.setHeader('Content-Type', mimeType)
    res.setHeader('X-Content-Type-Options', 'nosniff')

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
    console.error('[POST /api/download] 500 -', error.message)
    res.status(500).json({ error: 'Error en la descarga' })
  }
}

async function handlePlaylist(req, res) {
  const incomingUrl = req.body?.url

  if (!incomingUrl) {
    console.warn('[POST /api/playlist] 400 - URL is required')
    return res.status(400).json({ error: 'URL is required' })
  }

  const url = incomingUrl.trim()

  if (!isValidUrl(url)) {
    console.warn(`[POST /api/playlist] 400 - Invalid URL: ${url.slice(0, 80)}`)
    return res.status(400).json({ error: 'URL no valida. Plataformas soportadas: YouTube, Facebook, Instagram, TikTok.' })
  }

  try {
    const info = await getVideoInfo(url, true)
    res.json(info)
  } catch (error) {
    console.error('[POST /api/playlist] 500 -', error.message)
    res.status(500).json({ error: 'No se pudo obtener la playlist' })
  }
}

router.post('/info', handleInfo)
router.post('/download', handleDownload)
router.post('/playlist', handlePlaylist)

export default router