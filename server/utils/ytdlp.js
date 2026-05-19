import { execFile } from 'child_process'
import { promisify } from 'util'
import { writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { fileURLToPath } from 'url'

const execFileAsync = promisify(execFile)

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const YTDLP_PATH = process.env.YTDLP_PATH || 'yt-dlp'
const YTDLP_YT_CLIENTS = process.env.YTDLP_YT_CLIENTS || 'mweb,web_safari,tv'
const YTDLP_YT_FALLBACK_CLIENTS = process.env.YTDLP_YT_FALLBACK_CLIENTS || 'android,ios,tv_embedded'
const FFMPEG_CANDIDATES = [
  join(__dirname, '..', 'bin', 'ffmpeg-master-latest-win64-gpl', 'bin'),
  join(__dirname, '..', 'bin'),
  '/usr/bin',
  '/usr/local/bin',
]

function findFfmpeg() {
  for (const dir of FFMPEG_CANDIDATES) {
    if (existsSync(join(dir, 'ffmpeg')) || existsSync(join(dir, 'ffmpeg.exe'))) {
      return dir
    }
  }
  return null
}

const FFMPEG_LOCATION = findFfmpeg()

const TEMP_DIR = join(tmpdir(), 'musicmasivedownload')
if (!existsSync(TEMP_DIR)) mkdirSync(TEMP_DIR, { recursive: true })

const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const COOKIES_PATH = join(dirname(fileURLToPath(import.meta.url)), 'cookies.txt')

if (process.env.YOUTUBE_COOKIES_B64) {
  try {
    const cookiesContent = Buffer.from(
      process.env.YOUTUBE_COOKIES_B64, 'base64'
    ).toString('utf-8')
    writeFileSync(COOKIES_PATH, cookiesContent)
    console.log('[ytdlp] ✅ Cookies escritas correctamente')
    console.log('[ytdlp] Primeros 50 chars:', cookiesContent.substring(0, 50))
  } catch (err) {
    console.error('[ytdlp] ❌ Error con cookies:', err.message)
  }
} else {
  console.warn('[ytdlp] ⚠️ No hay YOUTUBE_COOKIES_B64 configurada')
}

function detectPlatform(url) {
  try {
    const host = new URL(url).hostname.toLowerCase()
    if (host.includes('youtube.com') || host.includes('youtu.be')) return 'youtube'
    if (host.includes('facebook.com') || host.includes('fb.watch')) return 'facebook'
    if (host.includes('instagram.com')) return 'instagram'
    if (host.includes('tiktok.com')) return 'tiktok'
  } catch {
    return 'unknown'
  }
  return 'unknown'
}

function isYoutubeBotCheckError(error) {
  const stderr = error?.stderr || ''
  const message = error?.message || ''
  const combined = `${message}\n${stderr}`.toLowerCase()
  const isBot = combined.includes('sign in to confirm') && combined.includes('not a bot')
  const isFormatNotAvailable = combined.includes('requested format is not available')
  return isBot || isFormatNotAvailable
}

const buildArgs = (url, extraArgs = [], options = {}) => {
  const args = [
    '--ignore-config',
    '--no-warnings',
    '--no-playlist',
    '--user-agent', DEFAULT_UA,
  ]

  const platform = detectPlatform(url)
  const {
    disableYoutubeCookies = false,
    youtubeClientsOverride,
    disableYoutubeExtractorArgs = false,
  } = options

  if (platform === 'youtube' && !disableYoutubeCookies && existsSync(COOKIES_PATH)) {
    args.push('--cookies', COOKIES_PATH)
  }

  if (platform === 'youtube' && !disableYoutubeExtractorArgs) {
    const ytClients = youtubeClientsOverride || YTDLP_YT_CLIENTS
    args.push('--extractor-args', `youtube:player_client=${ytClients}`)
  }

  if (platform === 'facebook') {
    args.push('--add-header', 'Referer:https://www.facebook.com/')
  }

  if (platform === 'instagram') {
    args.push('--add-header', 'Referer:https://www.instagram.com/')
  }

  if (platform === 'tiktok') {
    args.push('--add-header', 'Referer:https://www.tiktok.com/')
  }

  return [...args, ...extraArgs, url]
}

async function executeYtdlp(url, extraArgs, execOptions) {
  const platform = detectPlatform(url)

  if (platform !== 'youtube') {
    const args = buildArgs(url, extraArgs)
    return execFileAsync(YTDLP_PATH, args, execOptions)
  }

  const attempts = [
    { disableYoutubeCookies: false, youtubeClientsOverride: YTDLP_YT_CLIENTS },
    { disableYoutubeCookies: true, youtubeClientsOverride: YTDLP_YT_FALLBACK_CLIENTS },
    { disableYoutubeCookies: true, youtubeClientsOverride: 'tv_embedded,tv,ios' },
    { disableYoutubeCookies: true, disableYoutubeExtractorArgs: true },
  ]

  let lastError
  for (let i = 0; i < attempts.length; i += 1) {
    const args = buildArgs(url, extraArgs, attempts[i])
    try {
      return await execFileAsync(YTDLP_PATH, args, execOptions)
    } catch (error) {
      lastError = error
      const shouldRetry = isYoutubeBotCheckError(error) && i < attempts.length - 1
      if (!shouldRetry) {
        throw error
      }
    }
  }

  throw lastError
}

function cleanYoutubeUrl(rawUrl) {
  try {
    const u = new URL(rawUrl)
    if (!u.hostname.includes('youtube') && !u.hostname.includes('youtu.be')) return rawUrl
    // Keep only video id for standard URLs
    if (u.searchParams.has('v')) {
      const v = u.searchParams.get('v')
      return `https://www.youtube.com/watch?v=${v}`
    }
  } catch {
    return rawUrl
  }
  return rawUrl
}

function parseJsonFromStdout(stdout) {
  if (!stdout) return null
  const jsonStart = stdout.indexOf('{')
  const jsonEnd = stdout.lastIndexOf('}')
  if (jsonStart === -1 || jsonEnd === -1) return null
  const cleanJson = stdout.slice(jsonStart, jsonEnd + 1)
  return JSON.parse(cleanJson)
}

function mapVideoInfo(data) {
  return {
    type: 'video',
    id: data.id,
    title: data.title,
    duration: data.duration,
    thumbnail: data.thumbnail || data.thumbnails?.[data.thumbnails.length - 1]?.url,
    uploader: data.uploader,
    view_count: data.view_count,
  }
}

export async function getVideoInfo(url, isPlaylist = false) {
  url = cleanYoutubeUrl(url)
  const extraArgs = ['--dump-json', isPlaylist ? '--yes-playlist' : '--no-playlist']

  if (isPlaylist) extraArgs.push('--flat-playlist')
  const args = buildArgs(url, extraArgs)

  let stdout = ''
  let stderr = ''
  try {
    const result = await executeYtdlp(url, extraArgs, {
      timeout: isPlaylist ? 30000 : 20000,
      maxBuffer: 5 * 1024 * 1024,
    })
    stdout = result.stdout
    stderr = result.stderr
  } catch (error) {
    stderr = error?.stderr || ''
    const msg = error?.message || ''
    const combined = `${msg}\n${stderr}`
    const combinedLower = combined.toLowerCase()

    console.error('[yt-dlp error]', {
      message: error?.message,
      stderr: error?.stderr,
      stdout: error?.stdout,
    })

    if (combined.includes('This video is unavailable')) {
      throw new Error('Este video no esta disponible o es privado.')
    }
    if (combinedLower.includes('sign in to confirm') && combinedLower.includes('not a bot')) {
      throw new Error('YouTube bloqueo la solicitud por verificacion antibot. Intenta nuevamente o usa cookies/proxy residencial actualizados.')
    }
    if (
      combinedLower.includes('age-restricted') ||
      combinedLower.includes('age restricted') ||
      combinedLower.includes('confirm your age')
    ) {
      throw new Error('Este video requiere confirmacion de edad o inicio de sesion.')
    }
    if (combined.includes('Private video')) {
      throw new Error('Este video es privado y no se puede descargar.')
    }
    if (combined.includes('HTTP Error 429') || combined.includes('Too Many Requests')) {
      throw new Error('YouTube esta limitando solicitudes. Espera unos minutos e intenta de nuevo.')
    }

    throw new Error('No se pudo obtener informacion del video.')
  }

  if (stderr && stderr.trim()) {
    console.log(`[yt-dlp] stderr: ${stderr.trim().slice(0, 500)}`)
  }

  if (isPlaylist) {
    const lines = stdout.trim().split('\n').filter((line) => line.trim())
    const videos = lines.map((line) => {
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

  const data = parseJsonFromStdout(stdout)
  if (!data) throw new Error('Invalid JSON output')
  return mapVideoInfo(data)
}

function getAudioQuality(quality) {
  const map = { '128': '5', '192': '2', '256': '1', '320': '0' }
  return map[quality] || '2'
}

function getVideoQuality(quality) {
  const q = Number.parseInt(quality, 10)
  if (!Number.isFinite(q)) return 'bestvideo+bestaudio/best'

  // Multi-fallback format string: try best separated video+audio first,
  // then best single format with height constraint, then best overall
  return (
    `bestvideo[height<=${q}]+bestaudio/best[height<=${q}]/` +
    `bestvideo[height<=${q}]/bestaudio[height<=${q}]/` +
    `best[height<=${q}]/best`
  )
}

function getVideoFormat(quality, platform) {
  if (platform === 'youtube') {
    return getVideoQuality(quality)
  }

  // Instagram/Facebook/TikTok often expose progressive streams only.
  // Prefer constrained MP4 and gracefully fallback to any best format.
  const q = Number.parseInt(quality, 10)
  if (Number.isFinite(q)) {
    return `best[ext=mp4][height<=${q}]/best[height<=${q}]/best[ext=mp4]/best`
  }
  return 'best[ext=mp4]/best'
}

export async function downloadMedia(url, format = 'mp3', quality = '192', title = '') {
  url = cleanYoutubeUrl(url)
  const platform = detectPlatform(url)
  const id = randomUUID()
  const outputTemplate = join(TEMP_DIR, `${id}.%(ext)s`)

  const extraArgs = []

  if (FFMPEG_LOCATION) {
    extraArgs.push('--ffmpeg-location', FFMPEG_LOCATION)
  }

  if (format === 'mp3') {
    extraArgs.push('-x', '--audio-format', 'mp3', '--audio-quality', getAudioQuality(quality))
  } else {
    extraArgs.push('-f', getVideoFormat(quality, platform), '--merge-output-format', 'mp4')
  }

  extraArgs.push('-o', outputTemplate)
  await executeYtdlp(url, extraArgs, {
    timeout: format === 'mp4' ? 10 * 60 * 1000 : 5 * 60 * 1000,
    maxBuffer: 10 * 1024 * 1024,
  })

  const ext = format === 'mp3' ? 'mp3' : 'mp4'
  let filePath = join(TEMP_DIR, `${id}.${ext}`)

  if (!existsSync(filePath)) {
    const files = readdirSync(TEMP_DIR).filter((f) => f.startsWith(id))
    if (files.length > 0) {
      filePath = join(TEMP_DIR, files[0])
    } else {
      throw new Error('Downloaded file not found')
    }
  }

  const safeTitle = title && title.trim() ? title.trim() : 'download'
  const finalExt = filePath.split('.').pop()

  return {
    filePath,
    filename: `${safeTitle}.${finalExt}`,
    mimeType: finalExt === 'mp3' ? 'audio/mpeg' : 'video/mp4',
  }
}