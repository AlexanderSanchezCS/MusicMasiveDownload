console.log('[ENV DEBUG] Variables disponibles:', Object.keys(process.env).filter(k => k.includes('YOUTUBE') || k.includes('COOKIE')))
console.log('[ENV DEBUG] YOUTUBE_COOKIES_B64 type:', typeof process.env.YOUTUBE_COOKIES_B64)
console.log('[ENV DEBUG] YOUTUBE_COOKIES_B64 length:', process.env.YOUTUBE_COOKIES_B64?.length ?? 'undefined')

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
const FFMPEG_CANDIDATES = [
  join(__dirname, '..', 'bin', 'ffmpeg-master-latest-win64-gpl', 'bin'),
  join(__dirname, '..', 'bin'),
]
const FFMPEG_LOCATION = FFMPEG_CANDIDATES.find((dir) =>
  existsSync(join(dir, 'ffmpeg.exe')) || existsSync(join(dir, 'ffmpeg'))
)

const TEMP_DIR = join(tmpdir(), 'musicmasivedownload')
if (!existsSync(TEMP_DIR)) mkdirSync(TEMP_DIR, { recursive: true })

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

const buildArgs = (url, extraArgs = []) => {
  const args = [
    '--no-warnings',
    '--no-playlist',
  ]

  if (existsSync(COOKIES_PATH)) {
    args.push('--cookies', COOKIES_PATH)
  }

  args.push('--extractor-args', 'youtube:player_client=mweb')

  return [...args, ...extraArgs, url]
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
    const result = await execFileAsync(YTDLP_PATH, args, {
      timeout: isPlaylist ? 30000 : 20000,
      maxBuffer: 5 * 1024 * 1024,
    })
    stdout = result.stdout
    stderr = result.stderr
  } catch (error) {
    stderr = error?.stderr || ''
    const msg = error?.message || ''
    const combined = `${msg}\n${stderr}`

    console.error('[yt-dlp error]', {
      message: error?.message,
      stderr: error?.stderr,
      stdout: error?.stdout,
    })

    if (combined.includes('This video is unavailable')) {
      throw new Error('Este video no esta disponible o es privado.')
    }
    if (combined.includes('Sign in to confirm') || combined.includes('age')) {
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
  const map = {
    '360': 'bestvideo[height<=360]+bestaudio/best[height<=360]',
    '480': 'bestvideo[height<=480]+bestaudio/best[height<=480]',
    '720': 'bestvideo[height<=720]+bestaudio/best[height<=720]',
    '1080': 'bestvideo[height<=1080]+bestaudio/best[height<=1080]',
    '1440': 'bestvideo[height<=1440]+bestaudio/best[height<=1440]',
    '2160': 'bestvideo[height<=2160]+bestaudio/best[height<=2160]',
  }
  return map[quality] || map['720']
}

export async function downloadMedia(url, format = 'mp3', quality = '192', title = '') {
  url = cleanYoutubeUrl(url)
  const id = randomUUID()
  const outputTemplate = join(TEMP_DIR, `${id}.%(ext)s`)

  const extraArgs = []

  if (FFMPEG_LOCATION) {
    extraArgs.push('--ffmpeg-location', FFMPEG_LOCATION)
  }

  if (format === 'mp3') {
    extraArgs.push('-x', '--audio-format', 'mp3', '--audio-quality', getAudioQuality(quality))
  } else {
    extraArgs.push('-f', getVideoQuality(quality), '--merge-output-format', 'mp4')
  }

  extraArgs.push('-o', outputTemplate)
  const args = buildArgs(url, extraArgs)

  await execFileAsync(YTDLP_PATH, args, {
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