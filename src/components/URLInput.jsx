import { useEffect, useRef, useState, memo, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { HiLink, HiPlayCircle, HiXMark, HiMusicalNote, HiFilm, HiSparkles, HiChevronDown } from 'react-icons/hi2'
import useStore, { isSupportedUrlForPlatform } from '../store/useStore'
import toast from 'react-hot-toast'

const QUALITIES = {
  mp3: [
    { id: '128', label: '128', unit: 'kbps', tag: null },
    { id: '192', label: '192', unit: 'kbps', tag: 'Popular' },
    { id: '256', label: '256', unit: 'kbps', tag: null },
    { id: '320', label: '320', unit: 'kbps', tag: 'HQ' },
  ],
  mp4: [
    { id: '360', label: '360p', unit: '', tag: null },
    { id: '480', label: '480p', unit: '', tag: null },
    { id: '720', label: '720p', unit: '', tag: 'HD' },
    { id: '1080', label: '1080p', unit: '', tag: 'Full HD' },
    { id: '1440', label: '1440p', unit: '', tag: '2K' },
    { id: '2160', label: '2160p', unit: '', tag: '4K' },
  ],
}

export default memo(function URLInput() {
  const urls = useStore((s) => s.urls)
  const setUrls = useStore((s) => s.setUrls)
  const startBatchDownload = useStore((s) => s.startBatchDownload)
  const isProcessing = useStore((s) => s.isProcessing)
  const format = useStore((s) => s.format)
  const setFormat = useStore((s) => s.setFormat)
  const quality = useStore((s) => s.quality)
  const setQuality = useStore((s) => s.setQuality)
  const activePlatform = useStore((s) => s.activePlatform)
  const [showQuality, setShowQuality] = useState(false)
  const qualityRef = useRef(null)

  const parsed = useMemo(() => {
    const lines = urls.split(/[\n,]+/).map((l) => l.trim()).filter((l) => l.length > 0)
    const valid = lines.filter((l) => isSupportedUrlForPlatform(l, activePlatform))
    return { total: lines.length, valid: valid.length, validList: valid }
  }, [urls, activePlatform])

  const handleDownload = async () => {
    if (parsed.validList.length === 0) {
      toast.error('Ingresa al menos un link valido')
      return
    }

    try {
      await startBatchDownload()
      toast.success('Descarga iniciada')
    } catch (error) {
      toast.error(error?.message || 'Error al iniciar la descarga')
    }
  }

  const currentQuality = QUALITIES[format].find((q) => q.id === quality) || QUALITIES[format][0]

  useEffect(() => {
    if (!showQuality) return
    const handleClickOutside = (event) => {
      if (qualityRef.current && !qualityRef.current.contains(event.target)) {
        setShowQuality(false)
      }
    }
    const handleEscape = (event) => {
      if (event.key === 'Escape') setShowQuality(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [showQuality])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className="glass rounded-2xl p-6 sm:p-8 relative z-20"
    >
      <div className="space-y-6">
        <div className="relative">
          <div className="absolute left-4 top-4 text-gray-500">
            <HiLink />
          </div>
          <textarea
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
            placeholder="Pega uno o varios links, uno por linea"
            rows={4}
            className="input-dark w-full rounded-xl pl-10 pr-10 py-3 text-sm text-gray-200 placeholder-gray-600 resize-none"
          />
          {urls && (
            <button
              type="button"
              onClick={() => setUrls('')}
              className="absolute right-3 top-3 text-gray-500 hover:text-red-400 transition-colors"
              aria-label="Limpiar"
            >
              <HiXMark />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-500">
          <HiSparkles className="text-red-500" />
          <span>{parsed.total} link(s) ingresados</span>
          <span>•</span>
          <span className={parsed.valid > 0 ? 'text-green-400' : 'text-gray-500'}>
            {parsed.valid} valido(s)
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setFormat('mp3')}
              className={`flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                format === 'mp3' ? 'btn-glow text-white' : 'glass text-gray-400 hover:text-white'
              }`}
            >
              <HiMusicalNote className="text-base" />
              MP3
            </button>
            <button
              type="button"
              onClick={() => setFormat('mp4')}
              className={`flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                format === 'mp4' ? 'btn-glow text-white' : 'glass text-gray-400 hover:text-white'
              }`}
            >
              <HiFilm className="text-base" />
              MP4
            </button>
          </div>

          <div className="relative" ref={qualityRef}>
            <button
              type="button"
              onClick={() => setShowQuality((s) => !s)}
              className="input-dark w-full rounded-xl px-4 py-3 text-sm text-gray-200 flex items-center justify-between"
            >
              <span className="flex items-center gap-2">
                <span className="text-gray-500">Calidad</span>
                <span className="text-white">{currentQuality.label}{currentQuality.unit ? ` ${currentQuality.unit}` : ''}</span>
              </span>
              <HiChevronDown className={`transition-transform ${showQuality ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {showQuality && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="absolute z-50 mt-2 w-full rounded-xl glass p-2"
                >
                  {QUALITIES[format].map((q) => (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => {
                        setQuality(q.id)
                        setShowQuality(false)
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                        q.id === quality ? 'bg-red-500/15 text-red-300' : 'text-gray-300 hover:bg-white/5'
                      }`}
                    >
                      <span>{q.label}{q.unit ? ` ${q.unit}` : ''}</span>
                      {q.tag && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-300">{q.tag}</span>}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button
            type="button"
            onClick={handleDownload}
            disabled={isProcessing}
            className={`btn-glow w-full rounded-xl px-4 py-3 text-sm font-semibold flex items-center justify-center gap-2 ${
              isProcessing ? 'opacity-60 cursor-not-allowed' : ''
            }`}
          >
            <HiPlayCircle className="text-lg" />
            {isProcessing ? 'Procesando...' : `Descargar ${parsed.valid || 0} video(s)`}
          </button>
        </div>
      </div>
    </motion.div>
  )
})