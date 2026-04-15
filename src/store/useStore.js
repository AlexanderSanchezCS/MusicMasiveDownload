import { create } from 'zustand'

// ─── Centralized API Configuration ───────────────────────────────────────
const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
const DOWNLOAD_BASE_URL = (import.meta.env.VITE_DOWNLOAD_API_URL || API_BASE_URL).replace(/\/$/, '')

function buildApiUrl(baseUrl, path) {
  return baseUrl ? `${baseUrl}/api/${path}` : `/api/${path}`
}

// ─── Centralized API Client ──────────────────────────────────────────────
/**
 * POST-based API client with validation, logging, and error handling.
 * All API calls MUST use this function — no raw fetch() allowed.
 */
async function apiCall(endpoint, body, baseUrl = API_BASE_URL) {
  const url = buildApiUrl(baseUrl, endpoint)

  // Validate URL field in request body
  if (body && typeof body === 'object' && 'url' in body) {
    if (!body.url || typeof body.url !== 'string' || body.url.trim().length === 0) {
      throw new Error('URL is required')
    }
  }

  // Debug logging (dev only)
  if (import.meta.env.DEV) {
    console.log(`[api] POST ${url}`, body)
  }

  // AbortController for timeout (30s for info, 5min for download)
  const isDownload = endpoint === 'download'
  const timeoutMs = isDownload ? 300000 : 30000
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    // Log non-OK responses
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}))
      const errorMsg = errorBody?.error || errorBody?.message || `HTTP ${response.status}`

      if (import.meta.env.DEV) {
        console.error(`[api] ERROR ${response.status} from ${url}:`, errorMsg)
      }

      if (response.status === 404) throw new Error('backend-unavailable')
      throw new Error(errorMsg)
    }

    return response
  } finally {
    clearTimeout(timeoutId)
  }
}

// ─── Constants ───────────────────────────────────────────────────────────
const MAX_CONCURRENT = 3
const MAX_HISTORY = 500
const MAX_LOCALSTORAGE_BYTES = 5 * 1024 * 1024 // 5 MB safety limit
const MAX_URLS_PER_BATCH = 20 // ✅ Maximum URLs per download batch

export const PLATFORMS = [
  { id: 'youtube',   label: 'YouTube',   icon: 'FaYoutube',   color: '#FF0000', hosts: ['youtube.com', 'youtu.be', 'www.youtube.com', 'm.youtube.com'] },
  { id: 'facebook',  label: 'Facebook',  icon: 'FaFacebook',  color: '#1877F2', hosts: ['facebook.com', 'www.facebook.com', 'fb.watch', 'm.facebook.com', 'web.facebook.com'] },
  { id: 'instagram', label: 'Instagram', icon: 'FaInstagram', color: '#E4405F', hosts: ['instagram.com', 'www.instagram.com'] },
  { id: 'tiktok',    label: 'TikTok',    icon: 'FaTiktok',    color: '#000000', hosts: ['tiktok.com', 'www.tiktok.com', 'vm.tiktok.com'] },
]

const ALL_HOSTS = PLATFORMS.flatMap(p => p.hosts)

// ─── Error Classification ────────────────────────────────────────────────
function friendlyError(error) {
  const msg = error?.message || ''
  if (msg.includes('Application not found') || msg.includes('backend-unavailable')) {
    return 'El backend de descargas no está disponible. Verifica VITE_API_URL en Vercel y que Railway esté activo.'
  }
  if (msg === 'Failed to fetch' || msg === 'NetworkError when attempting to fetch resource.') {
    return 'No se pudo conectar con el servidor. Verifica tu conexión o inténtalo más tarde.'
  }
  if (msg.includes('rate') || msg.includes('429') || msg.includes('Demasiadas')) {
    return 'Demasiadas solicitudes. Espera unos minutos antes de intentar de nuevo.'
  }
  if (msg.includes('timeout') || msg.includes('Timeout')) {
    return 'La solicitud tardó demasiado. Inténtalo de nuevo.'
  }
  if (msg.includes('502') || msg.includes('503') || msg.includes('504')) {
    return 'El servidor está ocupado o reiniciándose. Inténtalo en unos segundos.'
  }
  if (msg.includes('Command failed') || msg.includes('yt-dlp') || msg.includes('ffmpeg')) {
    return 'No se pudo procesar este enlace. Verifica que el video sea público y el link sea correcto.'
  }
  if (msg === 'URL is required') {
    return 'La URL está vacía. Ingresa un link válido.'
  }
  // TikTok-specific
  if (msg.includes('TikTok bloqueó')) {
    return 'TikTok bloqueó la solicitud. Espera unos minutos e intenta de nuevo.'
  }
  if (msg.includes('expiró')) {
    return 'El enlace de TikTok expiró. Genera un nuevo enlace desde la app.'
  }
  return msg || 'Error desconocido'
}

// ─── URL Helpers ─────────────────────────────────────────────────────────
export function isSupportedUrlForPlatform(url, platformId) {
  if (platformId === 'all') {
    try { const u = new URL(url); return ALL_HOSTS.some(h => u.hostname === h || u.hostname.endsWith('.' + h)) } catch { return false }
  }
  const platform = PLATFORMS.find(p => p.id === platformId)
  if (!platform) {
    try { const u = new URL(url); return ALL_HOSTS.some(h => u.hostname === h || u.hostname.endsWith('.' + h)) } catch { return false }
  }
  try {
    const u = new URL(url)
    return platform.hosts.some(h => u.hostname === h || u.hostname.endsWith('.' + h))
  } catch { return false }
}

function isPlaylistUrl(url) {
  try {
    const u = new URL(url)
    return u.searchParams.has('list') && !u.searchParams.has('v')
  } catch { return false }
}

function estimateFileSize(durationSec, format, quality) {
  if (!durationSec || durationSec <= 0) return 0
  if (format === 'mp3') {
    const bitrateMap = { '128': 128, '192': 192, '256': 256, '320': 320 }
    const kbps = bitrateMap[quality] || 192
    return Math.round(durationSec * (kbps * 1000 / 8) * 1.15)
  }
  // ✅ FIX 12 — More accurate YouTube bitrate estimates
  const videoBitrateMap = { '360': 500, '480': 800, '720': 1500, '1080': 3000, '1440': 6000, '2160': 12000 }
  const kbps = videoBitrateMap[quality] || 1500
  return Math.round(durationSec * (kbps * 1000 / 8) * 1.05)
}

// ─── Zustand Store ───────────────────────────────────────────────────────
const useStore = create((set, get) => ({
  // URLs input
  urls: '',
  setUrls: (urls) => set({ urls }),

  // Format & Quality
  format: 'mp3',
  setFormat: (format) => set({ format }),
  quality: '192',
  setQuality: (quality) => set({ quality }),

  // Downloads queue
  downloads: [],
  addDownload: (download) => set((s) => ({
    downloads: [...s.downloads, { ...download, id: crypto.randomUUID(), progress: 0, status: 'pending' }]
  })),
  updateDownload: (id, data) => set((s) => ({
    downloads: s.downloads.map(d => d.id === id ? { ...d, ...data } : d)
  })),
  removeDownload: (id) => set((s) => ({
    downloads: s.downloads.filter(d => d.id !== id)
  })),
  clearDownloads: () => set({ downloads: [] }),

  // History
  history: (() => {
    try { return JSON.parse(localStorage.getItem('mmdownload_history') || '[]') } catch { return [] }
  })(),
  addToHistory: (item) => set((s) => {
    // ✅ FIX 10 — Add unique ID to prevent duplicate keys in React
    const newHistory = [{ ...item, id: crypto.randomUUID(), downloadedAt: new Date().toISOString() }, ...s.history].slice(0, MAX_HISTORY)
    try {
      const serialized = JSON.stringify(newHistory)
      if (serialized.length < MAX_LOCALSTORAGE_BYTES) {
        localStorage.setItem('mmdownload_history', serialized)
      }
    } catch { /* quota exceeded — skip silently */ }
    return { history: newHistory }
  }),
  clearHistory: () => {
    localStorage.removeItem('mmdownload_history')
    set({ history: [] })
  },

  // UI State
  isProcessing: false,
  setIsProcessing: (v) => set({ isProcessing: v }),
  activeTab: 'download',
  setActiveTab: (tab) => set({ activeTab: tab }),
  showHistory: false,
  setShowHistory: (v) => set({ showHistory: v }),
  activePlatform: 'all',
  setActivePlatform: (p) => set({ activePlatform: p }),

  // Parse URLs
  parseUrls: () => {
    const { urls, activePlatform } = get()
    const lines = urls.split(/[\n,]+/).map(l => l.trim()).filter(l => l.length > 0)
    return lines.filter(l => isSupportedUrlForPlatform(l, activePlatform))
  },

  // ─── Health Check ────────────────────────────────────────────────────
  checkHealth: async () => {
    try {
      const url = buildApiUrl(API_BASE_URL, 'health')
      const res = await fetch(url, { method: 'GET' })
      if (!res.ok) return { ok: false, status: res.status }
      const data = await res.json()
      return { ok: true, data }
    } catch {
      return { ok: false, error: 'unreachable' }
    }
  },

  // ─── Playlist Resolution (POST /api/playlist) ────────────────────────
  resolvePlaylist: async (playlistUrl) => {
    if (!playlistUrl || typeof playlistUrl !== 'string' || playlistUrl.trim().length === 0) {
      throw new Error('URL is required')
    }
    try {
      const res = await apiCall('playlist', { url: playlistUrl })
      const data = await res.json()
      if (data.type === 'playlist' && data.videos?.length) {
        return data.videos.map(v => v.url)
      }
      return [playlistUrl]
    } catch (error) {
      throw new Error(friendlyError(error))
    }
  },

  // ─── Download Single URL (POST /api/info → POST /api/download) ───────
  downloadSingle: async (url, id) => {
    const { format, quality, updateDownload, addToHistory } = get()

    // Validate URL before any network call
    if (!url || typeof url !== 'string' || url.trim().length === 0) {
      updateDownload(id, { status: 'error', error: 'La URL está vacía.' })
      return
    }

    try {
      // Step 1: Get video info → progress 0 → 5%
      // Detect platform for UX-specific status messages
      const isTiktokUrl = url.includes('tiktok.com') || url.includes('vm.tiktok.com')
      updateDownload(id, {
        progress: 2,
        title: isTiktokUrl ? 'Procesando TikTok...' : 'Obteniendo información...',
      })

      const infoRes = await apiCall('info', { url })
      const info = await infoRes.json()

      if (import.meta.env.DEV) {
        console.log(`[download] Got info for "${info.title}" (${info.duration}s)`)
      }

      updateDownload(id, {
        title: info.title,
        thumbnail: info.thumbnail,
        duration: info.duration,
        progress: 5,
      })

      // Step 2: Start download → progress 8%
      updateDownload(id, { progress: 8, title: isTiktokUrl ? 'Descargando de TikTok...' : info.title })

      const downloadRes = await apiCall('download', {
        url,
        format,
        quality,
        title: info.title || '',
      })

      // Step 3: Stream with progress
      const contentLength = Number(downloadRes.headers.get('Content-Length') || 0)
      const estimated = contentLength > 0
        ? contentLength
        : estimateFileSize(info.duration, format, quality)

      // ✅ FIX B — Guard against null body (prevents TypeError crash)
      if (!downloadRes.body) {
        throw new Error('El servidor no envió el archivo. Inténtalo de nuevo.')
      }

      const reader = downloadRes.body.getReader()
      const chunks = []
      let received = 0

      const PROGRESS_START = 10
      const PROGRESS_END = 95

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        received += value.length

        let pct
        if (estimated > 0) {
          const ratio = Math.min(received / estimated, 1)
          pct = Math.round(PROGRESS_START + ratio * (PROGRESS_END - PROGRESS_START))
        } else {
          pct = Math.round(PROGRESS_START + (PROGRESS_END - PROGRESS_START) * (1 - 1 / (1 + received / 500000)))
        }
        updateDownload(id, { progress: Math.min(pct, PROGRESS_END) })
      }

      // ✅ FIX 2 — Validate download integrity (permissive thresholds to avoid false positives)
      const MIN_EXPECTED_BYTES = format === 'mp3' ? 1000 : 5000
      if (received < MIN_EXPECTED_BYTES) {
        throw new Error('La descarga fue incompleta. Inténtalo de nuevo.')
      }

      // Step 4: Build blob and trigger download → 95 → 100%
      updateDownload(id, { progress: 97 })
      const blob = new Blob(chunks)
      chunks.length = 0
      const filename = `${info.title || 'download'}.${format}`

      const blobUrl = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = filename.replace(/[<>:"/\\|?*]/g, '_')
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      // ✅ FIX 3 — Revoke immediately after click to prevent memory leak
      requestAnimationFrame(() => window.URL.revokeObjectURL(blobUrl))

      updateDownload(id, { progress: 100, status: 'completed' })
      addToHistory({
        url,
        title: info.title,
        format,
        quality,
        thumbnail: info.thumbnail,
      })

      if (import.meta.env.DEV) {
        console.log(`[download] Completed: "${info.title}"`)
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error(`[download] Failed for "${url}":`, error)
      }
      updateDownload(id, { status: 'error', error: friendlyError(error) })
    }
  },

  // ─── Retry a single failed download ──────────────────────────────────
  retryDownload: async (id) => {
    const { downloads, downloadSingle, updateDownload } = get()
    const dl = downloads.find(d => d.id === id)
    if (!dl || dl.status !== 'error') return

    updateDownload(id, { status: 'downloading', progress: 0, error: null, title: 'Reintentando...' })
    await downloadSingle(dl.url, id)
  },

  // ─── Batch Download with Concurrency ─────────────────────────────────
  startBatchDownload: async () => {
    const { parseUrls, resolvePlaylist, downloadSingle, format, quality, setIsProcessing, checkHealth, urls } = get()
    const validUrls = parseUrls()

    if (validUrls.length === 0) return

    // ✅ FIX 7 — Limit maximum URLs per batch
    if (validUrls.length > MAX_URLS_PER_BATCH) {
      throw new Error(`Máximo ${MAX_URLS_PER_BATCH} URLs por lote. Has ingresado ${validUrls.length}.`)
    }

    // Health check before starting batch
    const health = await checkHealth()
    if (!health.ok) {
      console.error('[batch] Backend unavailable. Health check failed:', health)
      // Still attempt downloads — health endpoint might be blocked by CORS
    } else if (import.meta.env.DEV) {
      console.log('[batch] Health check passed:', health.data)
    }

    setIsProcessing(true)

    // Expand playlists
    const expandedUrls = []
    for (const url of validUrls) {
      if (isPlaylistUrl(url)) {
        try {
          const videos = await resolvePlaylist(url)
          expandedUrls.push(...videos)
        } catch {
          expandedUrls.push(url)
        }
      } else {
        expandedUrls.push(url)
      }
    }

    // Queue with unique IDs
    const entries = expandedUrls.map((url) => {
      const id = crypto.randomUUID()
      set((s) => ({
        downloads: [...s.downloads, { url, title: 'Obteniendo información...', format, quality, id, progress: 0, status: 'downloading' }]
      }))
      return { url, id }
    })

    // ✅ FIX 2 — Race condition: proper error handling and cleanup
    const executing = new Set()
    for (const entry of entries) {
      const p = downloadSingle(entry.url, entry.id)
        .catch(() => {}) // Avoids throw breaking the Set
        .finally(() => executing.delete(p)) // Always cleans up
      executing.add(p)
      if (executing.size >= MAX_CONCURRENT) {
        await Promise.race(executing)
      }
    }
    await Promise.allSettled(executing) // Waits all at the end

    setIsProcessing(false)
  },
}))

export default useStore
