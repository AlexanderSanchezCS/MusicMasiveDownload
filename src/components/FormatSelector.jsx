import { motion } from 'framer-motion'
import { HiMusicalNote, HiFilm, HiCog6Tooth } from 'react-icons/hi2'
import useStore from '../store/useStore'

const formats = [
  { id: 'mp3', label: 'MP3', desc: 'Solo audio', icon: <HiMusicalNote /> },
  { id: 'mp4', label: 'MP4', desc: 'Video + audio', icon: <HiFilm /> },
]

const qualities = {
  mp3: [
    { id: '128', label: '128 kbps', desc: 'Estándar' },
    { id: '192', label: '192 kbps', desc: 'Alta calidad' },
    { id: '256', label: '256 kbps', desc: 'Muy alta' },
    { id: '320', label: '320 kbps', desc: 'Máxima calidad' },
  ],
  mp4: [
    { id: '360', label: '360p', desc: 'Bajo' },
    { id: '480', label: '480p', desc: 'Estándar' },
    { id: '720', label: '720p', desc: 'HD' },
    { id: '1080', label: '1080p', desc: 'Full HD' },
    { id: '1440', label: '1440p', desc: '2K' },
    { id: '2160', label: '2160p', desc: '4K' },
  ],
}

export default function FormatSelector() {
  const { format, setFormat, quality, setQuality, isProcessing } = useStore()
  const currentQualities = qualities[format]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.7 }}
      className="glass rounded-2xl p-6 sm:p-8"
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 rounded-lg bg-red-600/20 flex items-center justify-center">
          <HiCog6Tooth className="text-red-500" />
        </div>
        <div>
          <h3 className="text-white font-semibold text-lg">Formato y calidad</h3>
          <p className="text-gray-500 text-xs">Elige el formato de salida y la calidad deseada</p>
        </div>
      </div>

      {/* Format selector */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {formats.map((f) => (
          <motion.button
            key={f.id}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              setFormat(f.id)
              setQuality(f.id === 'mp3' ? '192' : '720')
            }}
            disabled={isProcessing}
            aria-pressed={format === f.id}
            aria-label={`Formato ${f.label}: ${f.desc}`}
            className={`p-4 rounded-xl text-left transition-all duration-300 ${
              format === f.id
                ? 'bg-gradient-to-br from-red-600/20 to-red-500/10 border border-red-500/40 shadow-lg shadow-red-500/5'
                : 'glass hover:border-gray-700'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`text-lg ${format === f.id ? 'text-red-500' : 'text-gray-500'}`}>
                {f.icon}
              </div>
              <div>
                <p className={`font-semibold text-sm ${format === f.id ? 'text-white' : 'text-gray-400'}`}>
                  {f.label}
                </p>
                <p className="text-xs text-gray-600">{f.desc}</p>
              </div>
            </div>
          </motion.button>
        ))}
      </div>

      {/* Quality selector */}
      <p className="text-gray-400 text-sm font-medium mb-3">Calidad</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {currentQualities.map((q) => (
          <motion.button
            key={q.id}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setQuality(q.id)}
            disabled={isProcessing}
            aria-pressed={quality === q.id}
            aria-label={`Calidad ${q.label} – ${q.desc}`}
            className={`p-3 rounded-lg text-center transition-all duration-300 ${
              quality === q.id
                ? 'bg-red-600/20 border border-red-500/40 text-white'
                : 'bg-white/[0.02] border border-white/[0.05] text-gray-500 hover:text-white hover:border-gray-700'
            }`}
          >
            <p className="font-semibold text-sm">{q.label}</p>
            <p className="text-[10px] text-gray-600 mt-0.5">{q.desc}</p>
          </motion.button>
        ))}
      </div>
    </motion.div>
  )
}
