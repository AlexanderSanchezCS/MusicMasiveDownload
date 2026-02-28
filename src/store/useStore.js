import { create } from 'zustand'

const API_URL = import.meta.env.VITE_API_URL || ''

/**
 * Supported platforms configuration
 */
export const PLATFORMS = [
  { id: 'youtube',   label: 'YouTube',   icon: 'FaYoutube',   color: '#FF0000', hosts: ['youtube.com', 'youtu.be', 'www.youtube.com', 'm.youtube.com'] },
  { id: 'facebook',  label: 'Facebook',  icon: 'FaFacebook',  color: '#1877F2', hosts: ['facebook.com', 'www.facebook.com', 'fb.watch', 'm.facebook.com', 'web.facebook.com'] },
  { id: 'instagram', label: 'Instagram', icon: 'FaInstagram', color: '#E4405F', hosts: ['instagram.com', 'www.instagram.com'] },
  { id: 'tiktok',    label: 'TikTok',    icon: 'FaTiktok',    color: '#000000', hosts: ['tiktok.com', 'www.tiktok.com', 'vm.tiktok.com'] },
]

const ALL_HOSTS = PLATFORMS.flatMap(p => p.hosts)

/**
 * Classify a fetch / network error into a user-friendly message.
 */
function friendlyError(error) {
  const msg = error?.message || ''
  if (msg === 'Failed to fetch' || msg === 'NetworkError when attempting to fetch resource.') {
    return 'No se pudo conectar con el servidor. Verifica tu conexión o inténtalo más tarde.'
  }
  if (msg.includes('rate') || msg.includes('429') || msg.includes('Demasiadas')) {
    return 'Demasiadas solicitudes. Espera unos minutos antes de intentar de nuevo.'
  }
  if (msg.includes('timeout') || msg.includes('Timeout')) {
    return 'La solicitud tardó demasiado. Inténtalo de nuevo.'
  }
  return msg || 'Error desconocido'
}

/**
 * Check if a URL belongs to any supported platform.
 */
function isSupportedUrl(url) {
  try {
    const u = new URL(url)
    return ALL_HOSTS.some(h => u.hostname === h || u.hostname.endsWith('.' + h))
  } catch {
    return false
  }
}

/**
 * Detect whether a YouTube URL points to a playlist.
 */
function isPlaylistUrl(url) {
  try {
    const u = new URL(url)
    return u.searchParams.has('list') && !u.searchParams.has('v')
  } catch {
    return false
  }
}

/**
 * Estimate download file size (bytes) from duration, format and quality.
 * This allows showing real progress even when Content-Length is unavailable
 * (e.g. when the response goes through Vercel's rewrite proxy).
 *
 * The estimates are intentionally conservative (slightly larger) so the
 * progress bar never overshoots past ~95% before the download finishes.
 */
function estimateFileSize(durationSec, format, quality) {
  if (!durationSec || durationSec <= 0) return 0

  if (format === 'mp3') {
    // kbps → bytes/sec = kbps * 1000 / 8
    const bitrateMap = { '128': 128, '192': 192, '256': 256, '320': 320 }
    const kbps = bitrateMap[quality] || 192
    // Add 15% overhead for metadata/container
    return Math.round(durationSec * (kbps * 1000 / 8) * 1.15)
  }

  // MP4: rough average bitrate estimates (video + audio) in kbps
  const videoBitrateMap = {
    '360': 700,
    '480': 1200,
    '720': 2500,
    '1080': 5000,
    '1440': 10000,
    '2160': 20000,
  }
  const kbps = videoBitrateMap[quality] || 2500
  return Math.round(durationSec * (kbps * 1000 / 8) * 1.1)
}

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
    downloads: [...s.downloads, { ...download, id: Date.now() + Math.random(), progress: 0, status: 'pending' }]
  })),
  updateDownload: (id, data) => set((s) => ({
    downloads: s.downloads.map(d => d.id === id ? { ...d, ...data } : d)
  })),
  removeDownload: (id) => set((s) => ({
    downloads: s.downloads.filter(d => d.id !== id)
  })),
  clearDownloads: () => set({ downloads: [] }),

  // History
  history: JSON.parse(localStorage.getItem('mmdownload_history') || '[]'),
  addToHistory: (item) => set((s) => {
    const newHistory = [{ ...item, downloadedAt: new Date().toISOString() }, ...s.history].slice(0, 100)
    localStorage.setItem('mmdownload_history', JSON.stringify(newHistory))
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

  // Active platform filter (cosmetic — all platforms always accepted)
  activePlatform: 'all',
  setActivePlatform: (p) => set({ activePlatform: p }),

  // Parse URLs from text (supports all platforms)
  parseUrls: () => {
    const { urls } = get()
    const lines = urls.split(/[\n,]+/).map(l => l.trim()).filter(l => l.length > 0)
    return lines.filter(l => isSupportedUrl(l))
  },

  // ---------- Playlist resolution ----------
  resolvePlaylist: async (playlistUrl) => {
    try {
      const res = await fetch(`${API_URL}/api/playlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: playlistUrl })
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Error ${res.status}`)
      }
      const data = await res.json()
      if (data.type === 'playlist' && data.videos?.length) {
        return data.videos.map(v => v.url)
      }
      return [playlistUrl]
    } catch (error) {
      throw new Error(friendlyError(error))
    }
  },

  // ---------- Download a single URL with real progress ----------
  downloadSingle: async (url, id) => {
    const { format, quality, updateDownload, addToHistory } = get()

    try {
      // 1. Get info  →  progress 0 → 5 %
      updateDownload(id, { progress: 2 })

      const infoRes = await fetch(`${API_URL}/api/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      })

      if (!infoRes.ok) {
        const body = await infoRes.json().catch(() => ({}))
        throw new Error(body.details || body.error || `Error ${infoRes.status} al obtener info`)
      }

      const info = await infoRes.json()
      updateDownload(id, { title: info.title, thumbnail: info.thumbnail, duration: info.duration, progress: 5 })

      // 2. Start download – pass title so backend skips a second yt-dlp call
      updateDownload(id, { progress: 8 })

      const downloadRes = await fetch(`${API_URL}/api/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, format, quality, title: info.title })
      })

      if (!downloadRes.ok) {
        const body = await downloadRes.json().catch(() => ({}))
        throw new Error(body.details || body.error || `Error ${downloadRes.status} en la descarga`)
      }

      // 3. Stream the response with real progress
      //    Use Content-Length if available, otherwise estimate from duration+quality
      const contentLength = Number(downloadRes.headers.get('Content-Length') || 0)
      const estimated = contentLength > 0
        ? contentLength
        : estimateFileSize(info.duration, format, quality)

      const reader = downloadRes.body.getReader()
      const chunks = []
      let received = 0

      // Progress range: 10% → 95% during streaming
      const PROGRESS_START = 10
      const PROGRESS_END = 95

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        received += value.length

        let pct
        if (estimated > 0) {
          // Real or estimated progress
          const ratio = Math.min(received / estimated, 1)
          pct = Math.round(PROGRESS_START + ratio * (PROGRESS_END - PROGRESS_START))
        } else {
          // No estimate available – asymptotic progress (never reaches 95)
          // Approaches PROGRESS_END logarithmically as more bytes arrive
          pct = Math.round(PROGRESS_START + (PROGRESS_END - PROGRESS_START) * (1 - 1 / (1 + received / 500000)))
        }
        updateDownload(id, { progress: Math.min(pct, PROGRESS_END) })
      }

      // 4. Build blob and trigger browser download  →  95 → 100 %
      updateDownload(id, { progress: 97 })
      const blob = new Blob(chunks)
      const filename = `${info.title || 'download'}.${format}`

      const blobUrl = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = filename.replace(/[<>:"/\\|?*]/g, '_')
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(blobUrl)

      updateDownload(id, { progress: 100, status: 'completed' })
      addToHistory({ url, title: info.title, format, quality, thumbnail: info.thumbnail })
    } catch (error) {
      updateDownload(id, { status: 'error', error: friendlyError(error) })
    }
  },

  // ---------- Start batch download (with playlist support) ----------
  startBatchDownload: async () => {
    const { parseUrls, resolvePlaylist, downloadSingle, format, quality, updateDownload, setIsProcessing } = get()
    let validUrls = parseUrls()

    if (validUrls.length === 0) return

    setIsProcessing(true)

    // Expand playlists into individual video URLs
    const expandedUrls = []
    for (const url of validUrls) {
      if (isPlaylistUrl(url)) {
        try {
          const videos = await resolvePlaylist(url)
          expandedUrls.push(...videos)
        } catch {
          // If playlist resolution fails, keep the original URL
          expandedUrls.push(url)
        }
      } else {
        expandedUrls.push(url)
      }
    }

    // Queue all downloads
    for (const url of expandedUrls) {
      const id = Date.now() + Math.random()
      set((s) => ({
        downloads: [...s.downloads, { url, title: 'Obteniendo información...', format, quality, id, progress: 0, status: 'downloading' }]
      }))
      await downloadSingle(url, id)
    }

    setIsProcessing(false)
  },
}))

export default useStore
