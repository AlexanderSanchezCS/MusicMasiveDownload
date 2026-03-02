import { memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { HiArrowDown, HiCheck, HiXMark, HiTrash, HiMusicalNote } from 'react-icons/hi2'
import useStore from '../store/useStore'

function ProgressBar({ progress, status }) {
  return (
    <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden mt-3">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${progress}%` }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className={`h-full rounded-full ${
          status === 'error'
            ? 'bg-red-600'
            : status === 'completed'
            ? 'bg-green-500'
            : 'progress-bar-animated'
        }`}
      />
    </div>
  )
}

// PERF: Memoize individual download items to avoid re-rendering the whole list
const DownloadItem = memo(function DownloadItem({ download }) {
  const { removeDownload } = useStore()

  const statusIcons = {
    pending: <div className="w-4 h-4 border-2 border-gray-600 border-t-red-500 rounded-full animate-spin" />,
    downloading: <div className="w-4 h-4 border-2 border-gray-600 border-t-red-500 rounded-full animate-spin" />,
    completed: <HiCheck className="text-green-500" />,
    error: <HiXMark className="text-red-500" />,
  }

  const statusLabels = {
    pending: 'En cola...',
    downloading: 'Descargando...',
    completed: 'Completado',
    error: download.error || 'Error',
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.98 }}
      transition={{ duration: 0.3 }}
      className="glass rounded-xl p-4 card-hover"
    >
      <div className="flex items-start gap-4">
        {/* Thumbnail */}
        <div className="flex-shrink-0 w-16 h-12 rounded-lg bg-gray-800/50 overflow-hidden flex items-center justify-center">
          {download.thumbnail ? (
            <img
              src={download.thumbnail}
              alt={download.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <HiMusicalNote className="text-gray-600 text-xl" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-white text-sm font-medium truncate">{download.title}</p>
              <p className="text-gray-600 text-xs truncate mt-0.5">{download.url}</p>
            </div>
            <button
              onClick={() => removeDownload(download.id)}
              className="text-gray-700 hover:text-red-500 transition-colors flex-shrink-0 mt-0.5"
            >
              <HiTrash className="text-sm" />
            </button>
          </div>

          {/* Status */}
          <div className="flex items-center gap-2 mt-2">
            {statusIcons[download.status]}
            <span className={`text-xs ${
              download.status === 'error' ? 'text-red-400' :
              download.status === 'completed' ? 'text-green-400' :
              'text-gray-500'
            }`}>
              {statusLabels[download.status]}
            </span>
            <span className="text-xs text-gray-700">•</span>
            <span className="text-xs text-gray-600 uppercase">{download.format}</span>
            <span className="text-xs text-gray-600">{download.quality}{download.format === 'mp3' ? 'kbps' : 'p'}</span>
          </div>

          <ProgressBar progress={download.progress} status={download.status} />
        </div>
      </div>
    </motion.div>
  )
})

export default function DownloadQueue() {
  const { downloads, clearDownloads } = useStore()

  if (downloads.length === 0) return null

  const completed = downloads.filter(d => d.status === 'completed').length
  const errors = downloads.filter(d => d.status === 'error').length

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="glass rounded-2xl p-6 sm:p-8"
    >
      {/* Section header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-red-600/20 flex items-center justify-center">
            <HiArrowDown className="text-red-500" />
          </div>
          <div>
            <h3 className="text-white font-semibold text-lg">Cola de descargas</h3>
            <p className="text-gray-500 text-xs">
              {downloads.length} total • {completed} completado(s) • {errors} error(es)
            </p>
          </div>
        </div>

        <button
          onClick={clearDownloads}
          className="text-xs text-gray-600 hover:text-red-500 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-500/5"
        >
          Limpiar todo
        </button>
      </div>

      {/* Overall progress */}
      <div className="mb-6">
        <div className="flex justify-between text-xs text-gray-500 mb-2">
          <span>Progreso general</span>
          <span>{Math.round((completed / downloads.length) * 100)}%</span>
        </div>
        <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${(completed / downloads.length) * 100}%` }}
            className="h-full bg-gradient-to-r from-red-600 to-red-500 rounded-full"
          />
        </div>
      </div>

      {/* Download items */}
      <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
        <AnimatePresence>
          {downloads.map((dl) => (
            <DownloadItem key={dl.id} download={dl} />
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
