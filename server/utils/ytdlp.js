import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync, mkdirSync, writeFileSync, chmodSync, readdirSync, statSync, unlinkSync } from 'fs'
import { readdir, stat, unlink } from 'fs/promises'
import { join, dirname } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { fileURLToPath } from 'url'

const execFileAsync = promisify(execFile)

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// ─── Binaries + temp dir ─────────────────────────────────────────────────
const YTDLP_PATH = process.env.YTDLP_PATH || 'yt-dlp'

// ─── Startup diagnostics ────────────────────────────────────────────────
;(async function startupCheck() {
  try {
    const { stdout } = await execFileAsync(YTDLP_PATH, ['--version'])
    console.log(`[startup] ✓ yt-dlp version: ${stdout.trim()}`)
  } catch (err) {
    console.error(`[startup] ✗ yt-dlp NOT FOUND at "${YTDLP_PATH}":`, err.message)
    console.error('[startup] Install: npm install -g yt-dlp && export PATH="$PATH:$(npm root -g)/yt-dlp"')
  }
})()

// ─── Instagram cookies ────────────────────────────────────────────────────
const IG_COOKIES_PATH = join(tmpdir(), 'ig_cookies.txt')
;(function initInstagramCookies() {
  const b64 = process.env.INSTAGRAM_COOKIES_BASE64
  if (b64) {
    try {
      const decoded = Buffer.from(b64, 'base64').toString('utf-8')
      writeFileSync(IG_COOKIES_PATH, decoded, { encoding: 'utf-8', mode: 0o600 })
      try { chmodSync(IG_COOKIES_PATH, 0o600) } catch {}
      console.log('[ig-cookies] Decoded Instagram cookies from INSTAGRAM_COOKIES_BASE64')
    } catch (e) {
      console.error('[ig-cookies] Failed to decode INSTAGRAM_COOKIES_BASE64:', e.message)
    }
  } else if (process.env.INSTAGRAM_COOKIES && existsSync(process.env.INSTAGRAM_COOKIES)) {
    console.log('[ig-cookies] Using cookies file from INSTAGRAM_COOKIES path')
  }
})()

function getInstagramCookiesPath() {
  if (existsSync(IG_COOKIES_PATH)) return IG_COOKIES_PATH
  const envPath = process.env.INSTAGRAM_COOKIES
  if (envPath && existsSync(envPath)) return envPath
  return null
}

// ─── URL cleaners ─────────────────────────────────────────────────────────
function cleanInstagramUrl(url) {
  try {
    const u = new URL(url)
    if (u.hostname.includes('instagram')) return `${u.origin}${u.pathname}`
  } catch {}
  return url
}

function cleanTiktokUrl(url) {
  try {
    const u = new URL(url)
    if (u.hostname.includes('tiktok')) {
      // Remove tracking params (utm_source, _r, etc.) but keep /video/ ID
      u.searchParams.delete('_r')
      u.searchParams.delete('_d')
      u.searchParams.delete('share_author_id')
      u.searchParams.delete('share_link_id')
      return u.toString()
    }
  } catch {}
  return url
}

async function resolveFacebookUrl(url) {
  try {
    const u = new URL(url)
    if (!u.hostname.includes('facebook') && !u.hostname.includes('fb.watch')) return url
    if (!u.pathname.startsWith('/share/')) return url

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const res = await fetch(url, {
      method: 'GET', redirect: 'follow', signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' },
    })
    clearTimeout(timeout)
    if (res.url && res.url !== url) {
      console.log(`[facebook] Resolved share URL: ${url} -> ${res.url}`)
      return res.url
    }
  } catch (e) {
    console.error('[facebook] Could not resolve share URL:', e.message)
  }
  return url
}

// ─── Platform-specific yt-dlp args ────────────────────────────────────────
function friendlyInstagramError(msg) {
  if (msg.includes('There is no video in this post'))
    return 'Este post de Instagram es una imagen, no un video. Solo se pueden descargar Reels y videos.'
  if (msg.includes('inappropriate') || msg.includes('unavailable for certain audiences'))
    return 'Este contenido de Instagram está restringido por edad o marcado como sensible.'
  if (msg.includes('login') || msg.includes('Login') || msg.includes('authentication'))
    return 'Este contenido de Instagram requiere iniciar sesión. Solo publicaciones públicas.'
  if (msg.includes('Private') || msg.includes('private'))
    return 'Esta cuenta o publicación de Instagram es privada.'
  if (msg.includes('not found') || msg.includes('404') || msg.includes('Not Found'))
    return 'No se encontró esta publicación de Instagram. Verifica el enlace.'
  if (msg.includes('rate') || msg.includes('429') || msg.includes('too many'))
    return 'Instagram está limitando las solicitudes. Espera unos minutos.'
  return null
}

function friendlyTiktokError(msg) {
  if (msg.includes('blocked') || msg.includes('captcha') || msg.includes('captchaVerify'))
    return 'TikTok bloqueó la solicitud. Espera unos minutos e intenta de nuevo.'
  if (msg.includes('expire') || msg.includes('expired') || msg.includes('token'))
    return 'El enlace de TikTok expiró. Genera un nuevo enlace e intenta de nuevo.'
  if (msg.includes('not found') || msg.includes('404') || msg.includes('Not Found'))
    return 'No se encontró este video de TikTok. Verifica que el enlace sea correcto.'
  if (msg.includes('private') || msg.includes('Private'))
    return 'Esta cuenta de TikTok es privada. Solo se pueden descargar videos públicos.'
  if (msg.includes('rate') || msg.includes('429') || msg.includes('too many'))
    return 'TikTok está limitando las solicitudes. Espera unos minutos.'
  if (msg.includes('region') || msg.includes('geo') || msg.includes('not available'))
    return 'Este video de TikTok no está disponible en tu región.'
  return null
}

function getInstagramArgs() {
  const args = [
    '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    '--add-header', 'Accept-Language:en-US,en;q=0.5',
    '--add-header', 'Sec-Fetch-Mode:navigate',
    '--extractor-retries', '3',
    '--socket-timeout', '30',
  ]
  const cookiesPath = getInstagramCookiesPath()
  if (cookiesPath) args.push('--cookies', cookiesPath)
  return args
}

// TikTok needs special headers and relaxed TLS to bypass anti-bot measures
function getTiktokArgs() {
  return [
    '--no-check-certificate',
    '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    '--referer', 'https://www.tiktok.com/',
    '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    '--add-header', 'Accept-Language:en-US,en;q=0.5',
    '--add-header', 'Sec-Fetch-Mode:navigate',
    '--add-header', 'Sec-Fetch-Site:same-origin',
    '--extractor-retries', '3',
    '--socket-timeout', '15',
    '--retries', '3',
  ]
}

// ─── Retry helpers ────────────────────────────────────────────────────────
async function execWithRetry(args, opts, platform, maxRetries = 2) {
  let lastError
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await execFileAsync(YTDLP_PATH, args, opts)
    } catch (error) {
      lastError = error
      const msg = error.message || ''
      // Don't retry for definitive errors
      if (msg.includes('no video in this post') || msg.includes('Private') ||
          msg.includes('not found') || msg.includes('404') || msg.includes('blocked') ||
          msg.includes('captcha')) {
        throw error
      }
      if (i < maxRetries) {
        const delay = (i + 1) * 2000
        await new Promise(r => setTimeout(r, delay))
        console.log(`[retry] ${platform} attempt ${i + 2}/${maxRetries + 1} after ${delay}ms`)
      }
    }
  }
  throw lastError
}

// TikTok-specific: longer retries with more attempts (TikTok is flaky)
async function execTiktokWithRetry(args, opts, maxRetries = 3) {
  let lastError
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await execFileAsync(YTDLP_PATH, args, opts)
    } catch (error) {
      lastError = error
      const msg = error.message || ''
      // Don't retry for definitive errors
      if (msg.includes('not found') || msg.includes('404') || msg.includes('blocked') ||
          msg.includes('captcha') || msg.includes('private')) {
        throw error
      }
      if (i < maxRetries) {
        const delay = (i + 1) * 3000  // 3s, 6s, 9s for TikTok
        await new Promise(r => setTimeout(r, delay))
        console.log(`[retry] TikTok attempt ${i + 2}/${maxRetries + 1} after ${delay}ms`)
      }
    }
  }
  throw lastError
}

// ─── Concurrency limiter ─────────────────────────────────────────────────
const MAX_CONCURRENT_DOWNLOADS = parseInt(process.env.MAX_CONCURRENT_DOWNLOADS || '10', 10)
const MAX_QUEUE_SIZE = 50 // ✅ Maximum downloads in queue
const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000 // ✅ 5 minutes timeout per process
let activeDownloads = 0
const downloadQueue = []

function acquireSlot() {
  return new Promise((resolve, reject) => {
    // ✅ FIX 6 — Reject if queue is full
    if (downloadQueue.length >= MAX_QUEUE_SIZE) {
      return reject(new Error('Servidor ocupado. Intenta en unos minutos.'))
    }
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
    downloadQueue.shift()()
  }
}

export function getDownloadStats() {
  return { active: activeDownloads, queued: downloadQueue.length, maxConcurrent: MAX_CONCURRENT_DOWNLOADS, maxQueueSize: MAX_QUEUE_SIZE }
}

// ─── Binaries + temp dir ─────────────────────────────────────────────────
const FFMPEG_DIR = join(__dirname, '..', 'bin')
const HAS_LOCAL_FFMPEG = existsSync(join(FFMPEG_DIR, 'ffmpeg.exe')) || existsSync(join(FFMPEG_DIR, 'ffmpeg'))

const TEMP_DIR = join(tmpdir(), 'musicmasivedownload')
if (!existsSync(TEMP_DIR)) mkdirSync(TEMP_DIR, { recursive: true })

// Temp cleanup
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000
const MAX_FILE_AGE_MS = 10 * 60 * 1000

// ✅ FIX 11 — Async cleanup to avoid blocking the event loop
async function cleanupTempFiles() {
  try {
    const now = Date.now()
    const files = await readdir(TEMP_DIR)
    let cleaned = 0
    for (const file of files) {
      const filePath = join(TEMP_DIR, file)
      try {
        const fileStat = await stat(filePath)
        if (now - fileStat.mtimeMs > MAX_FILE_AGE_MS) {
          await unlink(filePath)
          cleaned++
        }
      } catch { /* ignore */ }
    }
    if (cleaned > 0) console.log(`[cleanup] Removed ${cleaned} stale temp files`)
  } catch (err) {
    console.error('[cleanup] Error cleaning temp dir:', err.message)
  }
}

cleanupTempFiles()
setInterval(cleanupTempFiles, CLEANUP_INTERVAL_MS)

// ─── Platform detection ──────────────────────────────────────────────────
function detectPlatform(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    if (hostname.includes('youtube') || hostname.includes('youtu.be')) return 'youtube'
    if (hostname.includes('facebook') || hostname.includes('fb.watch')) return 'facebook'
    if (hostname.includes('instagram')) return 'instagram'
    if (hostname.includes('tiktok') || hostname.includes('musical.ly')) return 'tiktok'
  } catch {}
  return 'other'
}

// ─── In-memory cache for /api/info (TTL-based + dedup) ───────────────────
// Stores: { data, expiresAt } keyed by URL
const infoCache = new Map()
// Stores: in-flight Promise keyed by URL (request deduplication)
const inFlightRequests = new Map()

const INFO_CACHE_TTL_MS = 3 * 60 * 1000 // 3 minutes
const CACHE_CLEANUP_INTERVAL_MS = 60 * 1000 // Clean every minute
// ✅ FIX 4 — Prevent unbounded cache growth
const MAX_CACHE_ENTRIES = 500

function getCachedInfo(url) {
  const entry = infoCache.get(url)
  if (entry && entry.expiresAt > Date.now()) return entry.data
  if (entry) infoCache.delete(url) // expired
  return null
}

function setCachedInfo(url, data) {
  // ✅ FIX 4 — Evict oldest entry when cache is full
  if (infoCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = infoCache.keys().next().value
    infoCache.delete(firstKey)
  }
  infoCache.set(url, { data, expiresAt: Date.now() + INFO_CACHE_TTL_MS })
}

function cacheCleanup() {
  const now = Date.now()
  for (const [url, entry] of infoCache.entries()) {
    if (entry.expiresAt <= now) infoCache.delete(url)
  }
}

setInterval(cacheCleanup, CACHE_CLEANUP_INTERVAL_MS)

// ─── getVideoInfo (with TikTok fix + caching + dedup) ────────────────────
export async function getVideoInfo(url, isPlaylist = false) {
  const platform = detectPlatform(url)

  // Platform-specific URL cleaning
  if (platform === 'instagram') url = cleanInstagramUrl(url)
  if (platform === 'facebook') url = await resolveFacebookUrl(url)
  if (platform === 'tiktok') url = cleanTiktokUrl(url)

  // Cache check (skip dedup for playlists — they're rare and heavy)
  const cacheKey = `${platform}:${url}:${isPlaylist ? 'pl' : 'vid'}`
  if (!isPlaylist) {
    const cached = getCachedInfo(cacheKey)
    if (cached) {
      console.log(`[cache] HIT for ${cacheKey}`)
      return cached
    }
  }

  // Deduplicate in-flight requests for same URL
  if (!isPlaylist && inFlightRequests.has(cacheKey)) {
    console.log(`[dedup] Waiting for in-flight request: ${cacheKey}`)
    return inFlightRequests.get(cacheKey)
  }

  const promise = _getVideoInfoImpl(url, platform, isPlaylist).then(result => {
    // Cache result
    if (!isPlaylist) setCachedInfo(cacheKey, result)
    return result
  }).finally(() => {
    // Remove from in-flight
    inFlightRequests.delete(cacheKey)
  })

  if (!isPlaylist) inFlightRequests.set(cacheKey, promise)
  return promise
}

async function _getVideoInfoImpl(url, platform, isPlaylist) {
  const args = [
    '--dump-json',
    '--no-warnings',
    isPlaylist ? '--yes-playlist' : '--no-playlist',
  ]

  if (isPlaylist) args.push('--flat-playlist')

  // Platform-specific args
  if (platform === 'instagram') args.push(...getInstagramArgs())
  if (platform === 'tiktok') args.push(...getTiktokArgs())

  args.push(url)

  const isInstagram = platform === 'instagram'
  const isTiktok = platform === 'tiktok'

  // Timeout: Instagram = 60s, TikTok = 20s, others = 15s
  const timeout = isInstagram ? 60000 : isTiktok ? 20000 : 15000

  const execOpts = {
    timeout,
    maxBuffer: 5 * 1024 * 1024,
  }

  console.log(`[info] ${platform} | timeout=${timeout}ms | url=${url.slice(0, 100)}`)

  try {
    const execFn = isInstagram
      ? () => execWithRetry(args, execOpts, platform)
      : isTiktok
        ? () => execTiktokWithRetry(args, execOpts)
        : () => execFileAsync(YTDLP_PATH, args, execOpts)

    const { stdout, stderr } = await execFn()

    // Log stderr for debugging (yt-dlp warnings, not errors)
    if (stderr && stderr.trim()) {
      console.log(`[info] ${platform} stderr: ${stderr.trim().slice(0, 500)}`)
    }

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

    // ✅ FIX 5 — Robust JSON parsing: yt-dlp may output warnings before JSON
    const jsonStr = stdout.slice(stdout.indexOf('{'), stdout.lastIndexOf('}') + 1)
    if (!jsonStr || jsonStr === '{}' || jsonStr.indexOf('{') === -1) {
      console.error(`[info] ${platform} Malformed JSON response: ${stdout.slice(0, 300)}`)
      throw new Error('Respuesta inválida del servidor')
    }

    let data
    try {
      data = JSON.parse(jsonStr)
    } catch (parseErr) {
      // Fallback: try each nested JSON object from last to first
      const matches = stdout.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g)
      if (!matches) throw new Error('Respuesta inválida del servidor')
      for (let i = matches.length - 1; i >= 0; i--) {
        try {
          data = JSON.parse(matches[i])
          break
        } catch { continue }
      }
      if (!data) throw new Error('Respuesta inválida del servidor')
    }
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
    // Log full stderr for debugging
    if (error.stderr) {
      console.error(`[info] ${platform} stderr (full):`, error.stderr.slice(0, 1000))
    }

    // Platform-specific friendly errors
    if (platform === 'instagram') {
      const friendly = friendlyInstagramError(error.message)
      if (friendly) throw new Error(friendly)
    }
    if (platform === 'tiktok') {
      const friendly = friendlyTiktokError(error.message)
      if (friendly) throw new Error(friendly)
    }

    // Strip command details
    const msg = error.message || ''
    if (msg.includes('Command failed') || msg.includes('ERROR:')) {
      const ytdlpError = msg.match(/ERROR:\s*(.+)/)?.[1]
      throw new Error(ytdlpError || 'No se pudo obtener información del video. Verifica que el enlace sea correcto y el contenido sea público.')
    }

    // Timeout detection
    if (msg.includes('timed out') || error.code === 'ETIMEDOUT' || error.killed === true) {
      if (platform === 'tiktok') {
        throw new Error('TikTok bloqueó la solicitud. Espera unos minutos e intenta de nuevo.')
      }
      throw new Error('La solicitud tardó demasiado. Inténtalo de nuevo.')
    }

    throw new Error('No se pudo obtener información del video.')
  }
}

// ─── getDirectUrl (MP4 streaming fast-path) ──────────────────────────────
export async function getDirectUrl(url, format = 'mp4', quality = '720') {
  if (format !== 'mp4') return null

  const platform = detectPlatform(url)

  if (platform === 'instagram') url = cleanInstagramUrl(url)
  if (platform === 'facebook') url = await resolveFacebookUrl(url)
  if (platform === 'tiktok') url = cleanTiktokUrl(url)

  const args = ['-g', '--no-warnings', '--no-playlist']

  if (platform === 'instagram') args.push(...getInstagramArgs())
  if (platform === 'tiktok') args.push(...getTiktokArgs())

  if (platform === 'youtube') {
    args.push('-f', `best[height<=${quality}][ext=mp4]/best[height<=${quality}]/best`)
  } else {
    args.push('-f', `best[height<=${quality}]/best`)
  }

  args.push(url)

  const execOpts = { timeout: 45000, maxBuffer: 1024 * 1024 }

  try {
    const execFn = platform === 'instagram'
      ? () => execWithRetry(args, execOpts, platform)
      : platform === 'tiktok'
        ? () => execTiktokWithRetry(args, execOpts)
        : () => execFileAsync(YTDLP_PATH, args, execOpts)

    const { stdout } = await execFn()
    const directUrl = stdout.split('\n').map(l => l.trim()).find(l => l.startsWith('http'))
    if (!directUrl) return null

    return { directUrl }
  } catch (error) {
    console.log(`[getDirectUrl] ${platform} failed: ${error.message.slice(0, 200)}`)
    return null
  }
}

// ─── downloadMedia ───────────────────────────────────────────────────────
export async function downloadMedia(url, format = 'mp3', quality = '192', title = '') {
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

  if (platform === 'instagram') url = cleanInstagramUrl(url)
  if (platform === 'facebook') url = await resolveFacebookUrl(url)
  if (platform === 'tiktok') url = cleanTiktokUrl(url)

  const args = ['--no-warnings', '--no-playlist']

  if (HAS_LOCAL_FFMPEG) args.push('--ffmpeg-location', FFMPEG_DIR)

  if (platform === 'instagram') args.push(...getInstagramArgs())
  if (platform === 'tiktok') args.push(...getTiktokArgs())

  if (format === 'mp3') {
    args.push('-x', '--audio-format', 'mp3', '--audio-quality', getAudioQuality(quality))
    if (platform === 'youtube') args.push('--embed-thumbnail', '--add-metadata')
  } else {
    if (platform === 'youtube') {
      args.push('-f', getVideoQuality(quality), '--merge-output-format', 'mp4')
    } else {
      args.push(
        '-f', `best[height<=${quality}][vcodec^=avc]/best[height<=${quality}]/best`,
        '-S', 'vcodec:h264,acodec:aac',
        '--remux-video', 'mp4',
      )
    }
  }

  args.push('-o', outputTemplate, url)

  const isInstagram = platform === 'instagram'
  const isTiktok = platform === 'tiktok'
  const dlTimeout = format === 'mp4' ? 600000 : 300000

  const dlOpts = { timeout: dlTimeout, maxBuffer: 10 * 1024 * 1024 }

  console.log(`[download] ${platform} | ${format}/${quality} | url=${url.slice(0, 100)}`)

  // ✅ FIX 5 — 5 minute timeout to kill stuck processes
  let killTimer = null
  const startTime = Date.now()

  try {
    const execFn = isInstagram
      ? () => execWithRetry(args, dlOpts, platform)
      : isTiktok
        ? () => execTiktokWithRetry(args, dlOpts)
        : () => execFileAsync(YTDLP_PATH, args, dlOpts)

    const { stderr } = await Promise.race([
      execFn(),
      new Promise((_, reject) => {
        killTimer = setTimeout(() => {
          reject(new Error(`Descarga timeout (${DOWNLOAD_TIMEOUT_MS / 1000}s). El servidor tardó demasiado.`))
        }, DOWNLOAD_TIMEOUT_MS)
      })
    ])

    // ✅ FIX 5 — Clear the kill timer on success
    if (killTimer) clearTimeout(killTimer)

    if (stderr && stderr.trim()) {
      console.log(`[download] ${platform} stderr: ${stderr.trim().slice(0, 500)}`)
    }

    const ext = format === 'mp3' ? 'mp3' : 'mp4'
    let filePath = join(TEMP_DIR, `${id}.${ext}`)

    const safeTitle = (title && title.trim()) ? title.trim() : 'download'

    if (!existsSync(filePath)) {
      const files = readdirSync(TEMP_DIR).filter(f => f.startsWith(id))
      if (files.length > 0) {
        filePath = join(TEMP_DIR, files[0])
      } else {
        throw new Error('No se encontró el archivo descargado')
      }
    }

    const finalExt = filePath.split('.').pop()
    console.log(`[download] Completed in ${Math.round((Date.now() - startTime) / 1000)}s`)
    return {
      filePath,
      filename: `${safeTitle}.${finalExt}`,
      mimeType: finalExt === 'mp3' ? 'audio/mpeg' : 'video/mp4',
    }
  } catch (error) {
    // ✅ FIX 5 — Clear the kill timer on error
    if (killTimer) clearTimeout(killTimer)

    if (platform === 'instagram') {
      const friendly = friendlyInstagramError(error.message)
      if (friendly) throw new Error(friendly)
    }
    if (platform === 'tiktok') {
      const friendly = friendlyTiktokError(error.message)
      if (friendly) throw new Error(friendly)
    }
    throw new Error(`Error en descarga: ${error.message}`)
  }
}

// ─── Quality maps ────────────────────────────────────────────────────────
function getAudioQuality(quality) {
  const map = { '128': '5', '192': '2', '256': '1', '320': '0' }
  return map[quality] || '2'
}

function getVideoQuality(quality) {
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
