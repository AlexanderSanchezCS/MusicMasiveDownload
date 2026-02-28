import { motion, AnimatePresence } from 'framer-motion'
import { HiClock, HiTrash, HiMusicalNote, HiFilm, HiArrowTopRightOnSquare } from 'react-icons/hi2'
import useStore from '../store/useStore'
import toast from 'react-hot-toast'

export default function DownloadHistory() {
  const { history, clearHistory } = useStore()

  const handleClearHistory = () => {
    clearHistory()
    toast.success('Historial limpiado')
  }

  if (history.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl p-12 text-center"
      >
        <div className="w-16 h-16 rounded-2xl bg-gray-800/50 flex items-center justify-center mx-auto mb-4">
          <HiClock className="text-gray-600 text-2xl" />
        </div>
        <h3 className="text-white font-semibold text-lg mb-2">Sin historial</h3>
        <p className="text-gray-500 text-sm">Tus descargas completadas aparecerán aquí</p>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl p-6 sm:p-8"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-red-600/20 flex items-center justify-center">
            <HiClock className="text-red-500" />
          </div>
          <div>
            <h3 className="text-white font-semibold text-lg">Historial de descargas</h3>
            <p className="text-gray-500 text-xs">{history.length} descarga(s) en total</p>
          </div>
        </div>

        <button
          onClick={handleClearHistory}
          className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-red-500 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-500/5"
        >
          <HiTrash className="text-sm" />
          Limpiar
        </button>
      </div>

      {/* History items */}
      <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
        <AnimatePresence>
          {history.map((item, index) => (
            <motion.div
              key={`${item.url}-${item.downloadedAt}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ delay: index * 0.03 }}
              className="flex items-center gap-4 p-3 rounded-xl bg-white/[0.02] border border-white/[0.03] hover:border-red-500/10 transition-all"
            >
              {/* Thumbnail */}
              <div className="flex-shrink-0 w-12 h-9 rounded-lg bg-gray-800/50 overflow-hidden flex items-center justify-center">
                {item.thumbnail ? (
                  <img src={item.thumbnail} alt={item.title} className="w-full h-full object-cover" />
                ) : (
                  <HiMusicalNote className="text-gray-600" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm truncate">{item.title}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-gray-600 uppercase flex items-center gap-1">
                    {item.format === 'mp3' ? <HiMusicalNote className="text-red-500" /> : <HiFilm className="text-red-500" />}
                    {item.format}
                  </span>
                  <span className="text-[10px] text-gray-700">•</span>
                  <span className="text-[10px] text-gray-600">{item.quality}{item.format === 'mp3' ? 'kbps' : 'p'}</span>
                  <span className="text-[10px] text-gray-700">•</span>
                  <span className="text-[10px] text-gray-600">
                    {new Date(item.downloadedAt).toLocaleDateString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>

              {/* Re-open link */}
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 text-gray-600 hover:text-red-500 transition-colors"
              >
                <HiArrowTopRightOnSquare className="text-sm" />
              </a>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
