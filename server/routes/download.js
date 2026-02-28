import { Router } from 'express'
import { getVideoInfo, downloadMedia } from '../utils/ytdlp.js'

const router = Router()

// Supported platform hostnames
const SUPPORTED_HOSTS = [
  'youtube.com', 'youtu.be', 'www.youtube.com', 'm.youtube.com',
  'facebook.com', 'www.facebook.com', 'fb.watch', 'm.facebook.com', 'web.facebook.com',
  'instagram.com', 'www.instagram.com',
  'tiktok.com', 'www.tiktok.com', 'vm.tiktok.com',
]

function isValidUrl(url) {
  try {
    const u = new URL(url)
    return SUPPORTED_HOSTS.some(h => u.hostname === h || u.hostname.endsWith('.' + h))
  } catch {
    return false
  }
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
    res.status(500).json({ error: 'No se pudo obtener información del video', details: error.message })
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

    const { filePath, filename, mimeType } = await downloadMedia(url, format, quality, title)

    // Send Content-Length so the client can compute real download progress
    const { statSync } = await import('fs')
    const stat = statSync(filePath)
    res.setHeader('Content-Length', stat.size)
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`)
    res.setHeader('Content-Type', mimeType)

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
      res.status(500).json({ error: 'Error en la descarga', details: error.message })
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

    const info = await getVideoInfo(url, true)
    res.json(info)
  } catch (error) {
    console.error('Playlist error:', error.message)
    res.status(500).json({ error: 'No se pudo obtener la playlist', details: error.message })
  }
})

export default router
