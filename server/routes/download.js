import { Router } from 'express'
import { getVideoInfo, downloadMedia } from '../utils/ytdlp.js'

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

/**
 * Sanitize a title string for use in filenames / Content-Disposition.
 * Removes control characters, path separators, and trims.
 */
function sanitizeTitle(raw) {
  if (!raw || typeof raw !== 'string') return 'download'
  return raw
    .replace(/[\x00-\x1f\x7f]/g, '')     // control chars
    .replace(/[\/\\:*?"<>|]/g, '_')       // filesystem-unsafe chars
    .replace(/\s+/g, ' ')                 // collapse whitespace
    .trim()
    .slice(0, 200)                         // cap length
    || 'download'
}

/**
 * POST /api/info
 * Get video information from a supported URL
 */
router.post('/info', async (req, res) => {
  try {
    const { url } = req.body

    if (!url) {
      return res.status(400).json({ error: 'URL es requerida' })
    }

    if (!isValidUrl(url)) {
      return res.status(400).json({ error: 'URL no válida. Plataformas soportadas: YouTube, Facebook, Instagram, TikTok.' })
    }

    const info = await getVideoInfo(url)
    res.json(info)
  } catch (error) {
    console.error('Info error:', error.message)
    res.status(500).json({ error: 'No se pudo obtener información del video' })
  }
})

/**
 * POST /api/download
 * Download media from a supported URL.
 */
router.post('/download', async (req, res) => {
  try {
    const { url, format = 'mp3', quality = '192', title = '' } = req.body

    if (!url) {
      return res.status(400).json({ error: 'URL es requerida' })
    }

    if (!isValidUrl(url)) {
      return res.status(400).json({ error: 'URL no válida. Plataformas soportadas: YouTube, Facebook, Instagram, TikTok.' })
    }

    if (!['mp3', 'mp4'].includes(format)) {
      return res.status(400).json({ error: 'Formato no soportado. Usa mp3 o mp4.' })
    }

    // SECURITY: Validate quality to prevent injection into yt-dlp arguments
    const allowedQualities = format === 'mp3' ? ALLOWED_AUDIO_QUALITIES : ALLOWED_VIDEO_QUALITIES
    const safeQuality = allowedQualities.includes(quality) ? quality : (format === 'mp3' ? '192' : '720')

    // Sanitize title for Content-Disposition
    const safeTitle = sanitizeTitle(title)

    const { filePath, filename, mimeType } = await downloadMedia(url, format, safeQuality, safeTitle)

    // Send Content-Length so the client can compute real download progress
    const { statSync } = await import('fs')
    const stat = statSync(filePath)
    res.setHeader('Content-Length', stat.size)
    // SECURITY: use RFC 5987 encoding for Content-Disposition filename
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`)
    res.setHeader('Content-Type', mimeType)
    // SECURITY: Prevent browsers from MIME-sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff')

    const { createReadStream } = await import('fs')
    const stream = createReadStream(filePath)

    // Cleanup helper
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
    console.error('Download error:', error.message)
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error en la descarga' })
    }
  }
})

/**
 * POST /api/playlist
 * Get playlist information (YouTube only)
 */
router.post('/playlist', async (req, res) => {
  try {
    const { url } = req.body

    if (!url) {
      return res.status(400).json({ error: 'URL es requerida' })
    }

    // SECURITY: Validate playlist URL same as other endpoints
    if (!isValidUrl(url)) {
      return res.status(400).json({ error: 'URL no válida. Plataformas soportadas: YouTube, Facebook, Instagram, TikTok.' })
    }

    const info = await getVideoInfo(url, true)
    res.json(info)
  } catch (error) {
    console.error('Playlist error:', error.message)
    res.status(500).json({ error: 'No se pudo obtener la playlist' })
  }
})

export default router
