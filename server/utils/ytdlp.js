import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, renameSync } from 'fs'
import { join, dirname } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { fileURLToPath } from 'url'

const execFileAsync = promisify(execFile)

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Clean Instagram URLs: remove tracking parameters that can cause issues.
 */
function cleanInstagramUrl(url) {
  try {
    const u = new URL(url)
    // Keep only the path (remove ?igsh=, ?utm_*, etc.)
    if (u.hostname.includes('instagram')) {
      // Preserve the core URL structure only
      return `${u.origin}${u.pathname}`
    }
  } catch {}
  return url
}

/**
 * Map common Instagram yt-dlp errors to friendly messages.
 */
function friendlyInstagramError(msg) {
  if (msg.includes('There is no video in this post')) {
    return 'Este post de Instagram es una imagen, no un video. Solo se pueden descargar Reels y videos.'
  }
  if (msg.includes('inappropriate') || msg.includes('unavailable for certain audiences')) {
    return 'Este contenido de Instagram está restringido por edad o marcado como sensible. Instagram no permite acceder sin iniciar sesión.'
  }
  if (msg.includes('login') || msg.includes('Login') || msg.includes('authentication')) {
    return 'Este contenido de Instagram requiere iniciar sesión. Solo se pueden descargar publicaciones públicas.'
  }
  if (msg.includes('Private') || msg.includes('private')) {
    return 'Esta cuenta o publicación de Instagram es privada. Solo se pueden descargar publicaciones públicas.'
  }
  if (msg.includes('not found') || msg.includes('404') || msg.includes('Not Found')) {
    return 'No se encontró esta publicación de Instagram. Verifica que el enlace sea correcto.'
  }
  if (msg.includes('rate') || msg.includes('429') || msg.includes('too many')) {
    return 'Instagram está limitando las solicitudes. Espera unos minutos e inténtalo de nuevo.'
  }
  return null // no match, use generic
}

/**
 * Build common Instagram yt-dlp arguments.
 */
function getInstagramArgs() {
  const args = [
    '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    '--add-header', 'Accept-Language:en-US,en;q=0.5',
    '--add-header', 'Sec-Fetch-Mode:navigate',
    '--extractor-retries', '3',
    '--socket-timeout', '30',
    '--no-check-certificates',
  ]

  // Support optional Instagram cookies file via environment variable
  const cookiesFile = process.env.INSTAGRAM_COOKIES
  if (cookiesFile && existsSync(cookiesFile)) {
    args.push('--cookies', cookiesFile)
  }

  return args
}

/**
 * Run a yt-dlp command with retry logic for Instagram.
 */
async function execWithRetry(args, opts, maxRetries = 2) {
  let lastError
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await execFileAsync(YTDLP_PATH, args, opts)
    } catch (error) {
      lastError = error
      // Don't retry for definitive errors
      const msg = error.message || ''
      if (
        msg.includes('no video in this post') ||
        msg.includes('Private') ||
        msg.includes('not found') ||
        msg.includes('404')
      ) {
        throw error
      }
      if (i < maxRetries) {
        // Wait before retry (exponential: 2s, 4s)
        await new Promise(r => setTimeout(r, (i + 1) * 2000))
        console.log(`[retry] Instagram attempt ${i + 2}/${maxRetries + 1}`)
      }
    }
  }
  throw lastError
}

// yt-dlp binary - defaults to system PATH
const YTDLP_PATH = process.env.YTDLP_PATH || 'yt-dlp'

// ffmpeg location - local bin folder
const FFMPEG_DIR = join(__dirname, '..', 'bin')
const HAS_LOCAL_FFMPEG = existsSync(join(FFMPEG_DIR, 'ffmpeg.exe')) || existsSync(join(FFMPEG_DIR, 'ffmpeg'))

// Temp directory for downloads
const TEMP_DIR = join(tmpdir(), 'musicmasivedownload')
if (!existsSync(TEMP_DIR)) {
  mkdirSync(TEMP_DIR, { recursive: true })
}

// --- Temp file cleanup: remove files older than 30 minutes every 10 minutes ---
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000 // 10 minutes
const MAX_FILE_AGE_MS = 30 * 60 * 1000     // 30 minutes

function cleanupTempFiles() {
  try {
    const now = Date.now()
    const files = readdirSync(TEMP_DIR)
    for (const file of files) {
      const filePath = join(TEMP_DIR, file)
      try {
        const stat = statSync(filePath)
        if (now - stat.mtimeMs > MAX_FILE_AGE_MS) {
          unlinkSync(filePath)
          console.log(`[cleanup] Removed stale temp file: ${file}`)
        }
      } catch { /* ignore individual file errors */ }
    }
  } catch (err) {
    console.error('[cleanup] Error cleaning temp dir:', err.message)
  }
}

// Run cleanup on startup and then periodically
cleanupTempFiles()
setInterval(cleanupTempFiles, CLEANUP_INTERVAL_MS)

/**
 * Get video information from a supported URL
 */
export async function getVideoInfo(url, isPlaylist = false) {
  const platform = detectPlatform(url)

  // Clean Instagram URLs to remove tracking params
  if (platform === 'instagram') {
    url = cleanInstagramUrl(url)
  }

  const args = [
    '--dump-json',
    '--no-warnings',
    '--no-playlist',
  ]

  // Instagram needs special handling
  if (platform === 'instagram') {
    args.push(...getInstagramArgs())
  }

  if (isPlaylist) {
    args[2] = '--yes-playlist'
    args.push('--flat-playlist')
  }

  args.push(url)

  const execOpts = {
    timeout: platform === 'instagram' ? 60000 : 30000,
    maxBuffer: 10 * 1024 * 1024,
  }

  try {
    const execFn = platform === 'instagram'
      ? () => execWithRetry(args, execOpts)
      : () => execFileAsync(YTDLP_PATH, args, execOpts)
    const { stdout } = await execFn()

    if (isPlaylist) {
      const lines = stdout.trim().split('\n').filter(l => l.trim())
      const videos = lines.map(line => {
        try {
          const data = JSON.parse(line)
          return {
            id: data.id,
            title: data.title,
            url: data.url || data.webpage_url || `https://www.youtube.com/watch?v=${data.id}`,
            duration: data.duration,
            thumbnail: data.thumbnail || data.thumbnails?.[0]?.url,
          }
        } catch {
          return null
        }
      }).filter(Boolean)

      return { type: 'playlist', videos, count: videos.length }
    }

    const data = JSON.parse(stdout)
    return {
      type: 'video',
      id: data.id,
      title: data.title,
      duration: data.duration,
      thumbnail: data.thumbnail || data.thumbnails?.[data.thumbnails.length - 1]?.url,
      uploader: data.uploader,
      view_count: data.view_count,
    }
  } catch (error) {
    if (platform === 'instagram') {
      const friendly = friendlyInstagramError(error.message)
      if (friendly) throw new Error(friendly)
    }
    throw new Error(`Error al obtener info: ${error.message}`)
  }
}

/**
 * Detect platform from URL to customize yt-dlp arguments.
 */
function detectPlatform(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    if (hostname.includes('youtube') || hostname.includes('youtu.be')) return 'youtube'
    if (hostname.includes('facebook') || hostname.includes('fb.watch')) return 'facebook'
    if (hostname.includes('instagram')) return 'instagram'
    if (hostname.includes('tiktok')) return 'tiktok'
  } catch {}
  return 'other'
}

/**
 * Download media from a supported URL.
 * Accepts an optional `title` so the caller can pass the title obtained
 * from /api/info, avoiding a second yt-dlp call just to get the title.
 */
export async function downloadMedia(url, format = 'mp3', quality = '192', title = '') {
  const id = randomUUID()
  const outputTemplate = join(TEMP_DIR, `${id}.%(ext)s`)
  const platform = detectPlatform(url)

  // Clean Instagram URLs
  if (platform === 'instagram') {
    url = cleanInstagramUrl(url)
  }

  const args = ['--no-warnings', '--no-playlist']

  // Add ffmpeg location if available locally
  if (HAS_LOCAL_FFMPEG) {
    args.push('--ffmpeg-location', FFMPEG_DIR)
  }

  // Instagram needs special headers, retries, and optional cookies
  if (platform === 'instagram') {
    args.push(...getInstagramArgs())
  }

  if (format === 'mp3') {
    args.push(
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', getAudioQuality(quality),
    )
    // --embed-thumbnail only reliable on YouTube
    if (platform === 'youtube') {
      args.push('--embed-thumbnail', '--add-metadata')
    }
  } else {
    // MP4 video
    if (platform === 'youtube') {
      // YouTube has separate streams — use specific format selector
      const videoQuality = getVideoQuality(quality)
      args.push(
        '-f', videoQuality,
        '--merge-output-format', 'mp4',
        '--postprocessor-args', 'ffmpeg:-c:a aac -b:a 192k',
        '--embed-thumbnail',
        '--add-metadata',
      )
    } else {
      // Facebook, Instagram, TikTok — single combined stream
      // Download best quality, we'll re-encode to H.264 after download
      args.push(
        '-f', `best[height<=${quality}]/best`,
        '-S', 'vcodec:h264',
      )
    }
  }

  args.push('-o', outputTemplate, url)

  const dlOpts = {
    timeout: 300000, // 5 minutes max
    maxBuffer: 50 * 1024 * 1024,
  }

  try {
    if (platform === 'instagram') {
      await execWithRetry(args, dlOpts)
    } else {
      await execFileAsync(YTDLP_PATH, args, dlOpts)
    }

    // Find the output file
    const ext = format === 'mp3' ? 'mp3' : 'mp4'
    let filePath = join(TEMP_DIR, `${id}.${ext}`)

    // Use the title provided by the caller; only fall back to 'download'
    const safeTitle = (title && title.trim()) ? title.trim() : 'download'

    if (!existsSync(filePath)) {
      // Try to find the actual file (extension may differ)
      const files = readdirSync(TEMP_DIR).filter(f => f.startsWith(id))
      if (files.length > 0) {
        filePath = join(TEMP_DIR, files[0])
      } else {
        throw new Error('No se encontró el archivo descargado')
      }
    }

    // Re-encode non-YouTube MP4 videos to H.264 for universal playback
    if (format === 'mp4' && platform !== 'youtube') {
      const h264Path = join(TEMP_DIR, `${id}_h264.mp4`)
      try {
        const ffmpegBin = HAS_LOCAL_FFMPEG ? join(FFMPEG_DIR, 'ffmpeg') : 'ffmpeg'
        await execFileAsync(ffmpegBin, [
          '-i', filePath,
          '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
          '-c:a', 'aac', '-b:a', '192k',
          '-movflags', '+faststart',
          '-y', h264Path,
        ], { timeout: 300000 })
        // Replace original with H.264 version
        unlinkSync(filePath)
        filePath = join(TEMP_DIR, `${id}.mp4`)
        renameSync(h264Path, filePath)
        console.log(`[h264] Re-encoded ${safeTitle} to H.264`)
      } catch (e) {
        console.error('[h264] Re-encode failed, serving original:', e.message)
        // If re-encode fails, clean up and serve original
        try { unlinkSync(h264Path) } catch {}
      }
    }

    const finalExt = filePath.split('.').pop()
    return {
      filePath,
      filename: `${safeTitle}.${finalExt}`,
      mimeType: finalExt === 'mp3' ? 'audio/mpeg' : 'video/mp4',
    }
  } catch (error) {
    // Friendly errors for Instagram
    if (platform === 'instagram') {
      const friendly = friendlyInstagramError(error.message)
      if (friendly) throw new Error(friendly)
    }
    throw new Error(`Error en descarga: ${error.message}`)
  }
}

function getAudioQuality(quality) {
  const map = {
    '128': '5',
    '192': '2',
    '256': '1',
    '320': '0',
  }
  return map[quality] || '2'
}

function getVideoQuality(quality) {
  const map = {
    '360': 'bestvideo[height<=360]+bestaudio/best[height<=360]',
    '480': 'bestvideo[height<=480]+bestaudio/best[height<=480]',
    '720': 'bestvideo[height<=720]+bestaudio/best[height<=720]',
    '1080': 'bestvideo[height<=1080]+bestaudio/best[height<=1080]',
    '1440': 'bestvideo[height<=1440]+bestaudio/best[height<=1440]',
    '2160': 'bestvideo[height<=2160]+bestaudio/best[height<=2160]',
  }
  return map[quality] || 'bestvideo[height<=720]+bestaudio/best[height<=720]'
}
