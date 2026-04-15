import { useState, memo, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { HiLink, HiPlayCircle, HiXMark, HiMusicalNote, HiFilm, HiSparkles, HiChevronDown } from 'react-icons/hi2'
import useStore, { isSupportedUrlForPlatform } from '../store/useStore'
import toast from 'react-hot-toast'

const QUALITIES = {
  mp3: [
    { id: '128',  label: '128',  unit: 'kbps', tag: null },
    { id: '192',  label: '192',  unit: 'kbps', tag: 'Popular' },
    { id: '256',  label: '256',  unit: 'kbps', tag: null },
    { id: '320',  label: '320',  unit: 'kbps', tag: 'HQ' },
  ],
  mp4: [
    { id: '360',  label: '360p',  unit: '', tag: null },
    { id: '480',  label: '480p',  unit: '', tag: null },
    { id: '720',  label: '720p',  unit: '', tag: 'HD' },
    { id: '1080', label: '1080p', unit: '', tag: 'Full HD' },
    { id: '1440', label: '1440p', unit: '', tag: '2K' },
    { id: '2160', label: '2160p', unit: '', tag: '4K' },
  ],
}

export default memo(function URLInput() {
  const urls = useStore((s) => s.urls)
  const setUrls = useStore((s) => s.setUrls)
  const parseUrls = useStore((s) => s.parseUrls)
  const startBatchDownload = useStore((s) => s.startBatchDownload)
  const isProcessing = useStore((s) => s.isProcessing)
  const format = useStore((s) => s.format)
  const setFormat = useStore((s) => s.setFormat)
  const quality = useStore((s) => s.quality)
  const setQuality = useStore((s) => s.setQuality)
  const activePlatform = useStore((s) => s.activePlatform)
  const [showQuality, setShowQuality] = useState(false)

  // ✅ FIX 1 — React #310: Inline URL filtering with activePlatform as dependency
  const { validCount, lineCount } = useMemo(() => {
    const lines = urls.split(/[\n,]+/).map(l => l.trim()).filter(l => l.length > 0)
    const valid = lines.filter(l => isSupportedUrlForPlatform(l, activePlatform))
    return { validCount: valid.length, lineCount: lines.length }
  }, [urls, activePlatform])
  const currentQualities = QUALITIES[format]
  const activeQuality = currentQualities.find(q => q.id === quality) || currentQualities[1]

  // Platform-specific UI config
  const PLATFORM_CONFIG = {
    youtube: {
      subtitle: 'Pega links de YouTube \u2014 videos, shorts o playlists',
      placeholder: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ\nhttps://youtu.be/dQw4w9WgXcQ\nhttps://www.youtube.com/shorts/...',
      ariaLabel: 'Pega uno o m\u00e1s links de YouTube',
    },
    facebook: {
      subtitle: 'Pega links de Facebook \u2014 videos, reels o watch',
      placeholder: 'https://www.facebook.com/watch/?v=...\nhttps://fb.watch/...\nhttps://www.facebook.com/reel/...',
      ariaLabel: 'Pega uno o m\u00e1s links de Facebook',
    },
    instagram: {
      subtitle: 'Pega links de Instagram \u2014 reels o videos p\u00fablicos',
      placeholder: 'https://www.instagram.com/reel/ABC123/\nhttps://www.instagram.com/p/ABC123/',
      ariaLabel: 'Pega uno o m\u00e1s links de Instagram',
    },
    tiktok: {
      subtitle: 'Pega links de TikTok \u2014 videos de cualquier usuario',
      placeholder: 'https://www.tiktok.com/@user/video/123456\nhttps://vm.tiktok.com/ABC123/',
      ariaLabel: 'Pega uno o m\u00e1s links de TikTok',
    },
  }

  const platformConfig = PLATFORM_CONFIG[activePlatform] || PLATFORM_CONFIG.youtube
  const platformLabel = ` de ${activePlatform.charAt(0).toUpperCase() + activePlatform.slice(1)}`

  const handleDownload = async () => {
    if (validCount === 0) {
      toast.error('Ingresa al menos un link válido')
      return
    }
    try {
      await startBatchDownload()
    } catch (error) {
      if (error.message?.includes('Máximo')) {
        toast.error(error.message)
      } else {
        toast.error(error.message || 'Error al iniciar descargas')
      }
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className="glass rounded-2xl p-6 sm:p-8"
    >
      {/* Section header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 rounded-lg bg-red-600/20 flex items-center justify-center">
          <HiLink className="text-red-500" />
        </div>
        <div>
          <h3 className="text-white font-semibold text-lg">Pega tus enlaces{platformLabel}</h3>
          <p className="text-gray-500 text-xs">{platformConfig.subtitle}</p>
        </div>
      </div>

      {/* Textarea */}
      <div className="relative">
        <label htmlFor="media-urls" className="sr-only">URLs de medios</label>
        <textarea
          id="media-urls"
          aria-label={platformConfig.ariaLabel}
          value={urls}
          onChange={(e) => setUrls(e.target.value)}
          placeholder={platformConfig.placeholder}
          rows={5}
          className="w-full input-dark rounded-xl px-5 py-4 text-sm text-gray-200 placeholder-gray-600 resize-none font-mono leading-relaxed"
          disabled={isProcessing}
        />
        {urls && (
          <button
            onClick={() => setUrls('')}
            aria-label="Limpiar URLs"
            className="absolute top-3 right-3 text-gray-600 hover:text-red-500 transition-colors"
          >
            <HiXMark className="text-lg" />
          </button>
        )}
      </div>

      {/* Info bar */}
      <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-gray-500">
        <span>{lineCount} link(s) ingresados</span>
        <span className="text-gray-700">•</span>
        <span className={validCount > 0 ? 'text-green-400' : 'text-gray-500'}>
          {validCount} válido(s)
        </span>
        {lineCount > validCount && lineCount > 0 && (
          <>
            <span className="text-gray-700">•</span>
            <span className="text-red-400">
              {lineCount - validCount} {activePlatform !== 'all' ? `no son de ${activePlatform.charAt(0).toUpperCase() + activePlatform.slice(1)}` : 'inválido(s)'}
            </span>
          </>
        )}
      </div>

      {/* Modern format + quality controls */}
      <div className="mt-6 p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
        <div className="flex flex-col gap-4">
          {/* Top row: Format + Quality picker */}
          <div className="flex flex-col sm:flex-row gap-4">

            {/* Format toggle - pill style */}
            <div className="flex-shrink-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold">Formato</span>
              </div>
              <div className="relative flex p-1 rounded-2xl bg-black/40 border border-white/[0.08]">
                {[
                  { id: 'mp3', label: 'MP3', icon: <HiMusicalNote className="text-sm" />, desc: 'Audio' },
                  { id: 'mp4', label: 'MP4', icon: <HiFilm className="text-sm" />, desc: 'Video' },
                ].map((f) => (
                  <motion.button
                    key={f.id}
                    onClick={() => {
                      setFormat(f.id)
                      setQuality(f.id === 'mp3' ? '192' : '720')
                      setShowQuality(false)
                    }}
                    disabled={isProcessing}
                    aria-pressed={format === f.id}
                    className={`relative z-10 flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${
                      format === f.id ? 'text-white' : 'text-gray-500 hover:text-gray-300'
                    }`}
                    whileTap={{ scale: 0.97 }}
                  >
                    {format === f.id && (
                      <motion.div
                        layoutId="format-bg"
                        className="absolute inset-0 rounded-xl bg-gradient-to-r from-red-600 to-red-500 shadow-lg shadow-red-500/20"
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-2">
                      {f.icon}
                      <span>{f.label}</span>
                      <span className={`text-[10px] ${format === f.id ? 'text-red-200' : 'text-gray-600'}`}>
                        {f.desc}
                      </span>
                    </span>
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Quality - custom dropdown */}
            <div className="flex-1 relative">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold">Calidad</span>
                {activeQuality.tag && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 font-bold uppercase tracking-wider">
                    {activeQuality.tag}
                  </span>
                )}
              </div>
              <button
                onClick={() => setShowQuality(!showQuality)}
                disabled={isProcessing}
                className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-black/40 border border-white/[0.08] hover:border-red-500/30 text-white text-sm font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-red-500/30"
              >
                <span className="flex items-center gap-2">
                  <HiSparkles className="text-red-500 text-xs" />
                  <span>{activeQuality.label}</span>
                  {activeQuality.unit && <span className="text-gray-500">{activeQuality.unit}</span>}
                </span>
                <HiChevronDown className={`text-gray-500 transition-transform duration-200 ${showQuality ? 'rotate-180' : ''}`} />
              </button>

              {/* Quality dropdown */}
              <AnimatePresence>
                {showQuality && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.96 }}
                    transition={{ duration: 0.15 }}
                    className="absolute z-50 top-full left-0 right-0 mt-2 p-2 rounded-2xl bg-gray-950/95 backdrop-blur-xl border border-white/[0.08] shadow-2xl shadow-black/60"
                  >
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {currentQualities.map((q) => (
                        <motion.button
                          key={q.id}
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => { setQuality(q.id); setShowQuality(false) }}
                          className={`relative flex flex-col items-center py-3 px-3 rounded-xl text-center transition-all duration-200 ${
                            quality === q.id
                              ? 'bg-red-600/20 border border-red-500/40 ring-1 ring-red-500/20'
                              : 'bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.06] hover:border-white/[0.1]'
                          }`}
                        >
                          <span className={`text-sm font-bold ${quality === q.id ? 'text-white' : 'text-gray-300'}`}>
                            {q.label}
                          </span>
                          {q.unit && (
                            <span className={`text-[10px] ${quality === q.id ? 'text-red-300' : 'text-gray-600'}`}>{q.unit}</span>
                          )}
                          {q.tag && (
                            <span className={`mt-1 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                              quality === q.id
                                ? 'bg-red-500/30 text-red-300'
                                : 'bg-white/[0.05] text-gray-500'
                            }`}>
                              {q.tag}
                            </span>
                          )}
                          {quality === q.id && (
                            <motion.div
                              layoutId="quality-check"
                              className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500"
                              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                            />
                          )}
                        </motion.button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Download button - full width */}
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleDownload}
            disabled={isProcessing}
            aria-label={isProcessing ? 'Procesando descargas' : `Descargar ${validCount} video(s)`}
            aria-busy={isProcessing}
            className={`w-full py-3.5 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2.5 transition-all duration-300 ${
              isProcessing || validCount === 0
                ? 'bg-gray-800/60 text-gray-500 cursor-not-allowed'
                : 'btn-glow cursor-pointer'
            }`}
          >
            {isProcessing ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Procesando descargas...
              </>
            ) : (
              <>
                <HiPlayCircle className="text-xl" />
                Descargar{validCount > 0 ? ` ${validCount} video(s)` : ''}
              </>
            )}
          </motion.button>
        </div>
      </div>
    </motion.div>
  )
})
