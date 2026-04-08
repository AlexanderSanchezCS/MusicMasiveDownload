import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, renameSync, writeFileSync, chmodSync } from 'fs'
import { join, dirname } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { fileURLToPath } from 'url'

const execFileAsync = promisify(execFile)

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// --- Instagram cookies: decode from base64 env var on startup ---
const IG_COOKIES_PATH = join(tmpdir(), 'ig_cookies.txt')
;(function initInstagramCookies() {
  // Option 1: base64-encoded cookies in env var (preferred for Railway)
  const b64 = process.env.INSTAGRAM_COOKIES_BASE64
  if (b64) {
    try {
      const decoded = Buffer.from(b64, 'base64').toString('utf-8')
      writeFileSync(IG_COOKIES_PATH, decoded, { encoding: 'utf-8', mode: 0o600 })
      // SECURITY: restrict cookie file permissions (owner-only)
      try { chmodSync(IG_COOKIES_PATH, 0o600) } catch {}
      console.log('[ig-cookies] Decoded Instagram cookies from INSTAGRAM_COOKIES_BASE64')
    } catch (e) {
      console.error('[ig-cookies] Failed to decode INSTAGRAM_COOKIES_BASE64:', e.message)
    }
  }
  // Option 2: direct file path in INSTAGRAM_COOKIES
  else if (process.env.INSTAGRAM_COOKIES && existsSync(process.env.INSTAGRAM_COOKIES)) {
    console.log('[ig-cookies] Using cookies file from INSTAGRAM_COOKIES path')
  }
})()

function getInstagramCookiesPath() {
  // Priority: decoded base64 file > direct file path
  if (existsSync(IG_COOKIES_PATH)) return IG_COOKIES_PATH
  const envPath = process.env.INSTAGRAM_COOKIES
  if (envPath && existsSync(envPath)) return envPath
  return null
}

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
 * Resolve Facebook share/short URLs to their canonical form.
 * facebook.com/share/r/xxx and facebook.com/share/v/xxx are redirects
 * that yt-dlp can’t always follow. We resolve them first.
 */
async function resolveFacebookUrl(url) {
  try {
    const u = new URL(url)
    // Only resolve share links
    if (!u.hostname.includes('facebook') && !u.hostname.includes('fb.watch')) return url
    if (!u.pathname.startsWith('/share/')) return url

    // Use a HEAD request with redirect follow to get the real URL
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      },
    })
    clearTimeout(timeout)
    // The final URL after redirects is the canonical one
    if (res.url && res.url !== url) {
      console.log(`[facebook] Resolved share URL: ${url} -> ${res.url}`)
      return res.url
    }
  } catch (e) {
    console.error('[facebook] Could not resolve share URL:', e.message)
  }
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
    // SECURITY: DO NOT use --no-check-certificates; it disables TLS verification
    // making the connection vulnerable to man-in-the-middle attacks.
  ]

  // Use Instagram cookies for authenticated access (bypasses age-gate, login walls)
  const cookiesPath = getInstagramCookiesPath()
  if (cookiesPath) {
    args.push('--cookies', cookiesPath)
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

// --- Concurrency limiter: prevent too many simultaneous yt-dlp / ffmpeg processes ---
// SCALE: 10 concurrent processes handles ~100 users well on Railway (1-2 vCPU, 2-8GB RAM).
// Each yt-dlp process uses ~50-100MB RAM. Adjust via env var for your server capacity.
const MAX_CONCURRENT_DOWNLOADS = parseInt(process.env.MAX_CONCURRENT_DOWNLOADS || '10', 10)
let activeDownloads = 0
const downloadQueue = []

function acquireSlot() {
  return new Promise((resolve) => {
    if (activeDownloads < MAX_CONCURRENT_DOWNLOADS) {
      activeDownloads++
      return resolve()
    }
    downloadQueue.push(resolve)
  })
}

function releaseSlot() {
  activeDownloads--
  if (downloadQueue.length > 0) {
    activeDownloads++
    const next = downloadQueue.shift()
    next()
  }
}

// Expose stats for health check / monitoring
export function getDownloadStats() {
  return {
    active: activeDownloads,
    queued: downloadQueue.length,
    maxConcurrent: MAX_CONCURRENT_DOWNLOADS,
  }
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

// --- Temp file cleanup: remove files older than 10 minutes every 5 minutes ---
// SCALE: With hundreds of users, files build up fast. Aggressive cleanup needed.
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000  // 5 minutes
const MAX_FILE_AGE_MS = 10 * 60 * 1000     // 10 minutes (file already streamed by then)

function cleanupTempFiles() {
  try {
    const now = Date.now()
    const files = readdirSync(TEMP_DIR)
    let cleaned = 0
    for (const file of files) {
      const filePath = join(TEMP_DIR, file)
      try {
        const stat = statSync(filePath)
        if (now - stat.mtimeMs > MAX_FILE_AGE_MS) {
          unlinkSync(filePath)
          cleaned++
        }
      } catch { /* ignore individual file errors */ }
    }
    if (cleaned > 0) console.log(`[cleanup] Removed ${cleaned} stale temp files (${files.length - cleaned} remaining)`)
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

  // Resolve Facebook share/short URLs
  if (platform === 'facebook') {
    url = await resolveFacebookUrl(url)
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
    maxBuffer: 5 * 1024 * 1024, // PERF: 5 MB is plenty for JSON metadata
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
    // Strip yt-dlp command details from error to avoid leaking internals
    const msg = error.message || ''
    if (msg.includes('Command failed') || msg.includes('ERROR:')) {
      // Extract just the yt-dlp error line if present
      const ytdlpError = msg.match(/ERROR:\s*(.+)/)?.[1]
      throw new Error(ytdlpError || 'No se pudo obtener información del video. Verifica que el enlace sea correcto y el contenido sea público.')
    }
    throw new Error('No se pudo obtener información del video.')
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
 * Get a direct media URL without downloading to disk.
 * Used by /api/download fast-path streaming proxy for MP4.
 */
export async function getDirectUrl(url, format = 'mp4', quality = '720') {
  if (format !== 'mp4') return null

  const platform = detectPlatform(url)

  if (platform === 'instagram') {
    url = cleanInstagramUrl(url)
  }

  if (platform === 'facebook') {
    url = await resolveFacebookUrl(url)
  }

  const args = ['-g', '--no-warnings', '--no-playlist']

  if (platform === 'instagram') {
    args.push(...getInstagramArgs())
  }

  if (platform === 'youtube') {
    args.push('-f', `best[height<=${quality}][ext=mp4]/best[height<=${quality}]/best`)
  } else {
    args.push('-f', `best[height<=${quality}]/best`)
  }

  args.push(url)

  const execOpts = {
    timeout: 45000,
    maxBuffer: 1024 * 1024,
  }

  try {
    const execFn = platform === 'instagram'
      ? () => execWithRetry(args, execOpts)
      : () => execFileAsync(YTDLP_PATH, args, execOpts)

    const { stdout } = await execFn()
    const directUrl = stdout
      .split('\n')
      .map(line => line.trim())
      .find(line => line.startsWith('http'))

    if (!directUrl) return null

    return { directUrl }
  } catch (error) {
    return null
  }
}

/**
 * Download media from a supported URL.
 * Accepts an optional `title` so the caller can pass the title obtained
 * from /api/info, avoiding a second yt-dlp call just to get the title.
 */
export async function downloadMedia(url, format = 'mp3', quality = '192', title = '') {
  // PERF: Wait for a concurrency slot before spawning yt-dlp
  await acquireSlot()

  try {
    return await _downloadMediaImpl(url, format, quality, title)
  } finally {
    releaseSlot()
  }
}

async function _downloadMediaImpl(url, format = 'mp3', quality = '192', title = '') {
  const id = randomUUID()
  const outputTemplate = join(TEMP_DIR, `${id}.%(ext)s`)
  const platform = detectPlatform(url)

  // Clean Instagram URLs
  if (platform === 'instagram') {
    url = cleanInstagramUrl(url)
  }

  // Resolve Facebook share/short URLs
  if (platform === 'facebook') {
    url = await resolveFacebookUrl(url)
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
      // Prefer H.264+AAC for instant merge; falls back to VP9+opus if needed
      const videoQuality = getVideoQuality(quality)
      args.push(
        '-f', videoQuality,
        '--merge-output-format', 'mp4',
      )
    } else {
      // Facebook, Instagram, TikTok — prefer H.264 for MP4 compatibility.
      // Use --remux-video to convert container to MP4 without slow re-encoding.
      args.push(
        '-f', `best[height<=${quality}][vcodec^=avc]/best[height<=${quality}]/best`,
        '-S', 'vcodec:h264,acodec:aac',
        '--remux-video', 'mp4',
      )
    }
  }

  args.push('-o', outputTemplate, url)

  // MP4 merges (especially if ffmpeg needs to transcode audio) can take longer than MP3
  const dlTimeout = format === 'mp4' ? 600000 : 300000 // 10 min MP4, 5 min MP3
  const dlOpts = {
    timeout: dlTimeout,
    maxBuffer: 10 * 1024 * 1024, // PERF: reduced from 50 MB; yt-dlp stdout for a single download is small
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
  // Prefer H.264 (avc1) + AAC (mp4a) to avoid slow VP9→H.264 re-encoding when merging to MP4.
  // Fallback chain: avc1+mp4a → avc1+any → any+any → single best stream.
  const map = {
    '360':  `bestvideo[height<=360][vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[height<=360][vcodec^=avc1]+bestaudio/bestvideo[height<=360]+bestaudio/best[height<=360]`,
    '480':  `bestvideo[height<=480][vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[height<=480][vcodec^=avc1]+bestaudio/bestvideo[height<=480]+bestaudio/best[height<=480]`,
    '720':  `bestvideo[height<=720][vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[height<=720][vcodec^=avc1]+bestaudio/bestvideo[height<=720]+bestaudio/best[height<=720]`,
    '1080': `bestvideo[height<=1080][vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[height<=1080][vcodec^=avc1]+bestaudio/bestvideo[height<=1080]+bestaudio/best[height<=1080]`,
    '1440': `bestvideo[height<=1440][vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[height<=1440][vcodec^=avc1]+bestaudio/bestvideo[height<=1440]+bestaudio/best[height<=1440]`,
    '2160': `bestvideo[height<=2160][vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[height<=2160][vcodec^=avc1]+bestaudio/bestvideo[height<=2160]+bestaudio/best[height<=2160]`,
  }
  return map[quality] || map['720']
}
