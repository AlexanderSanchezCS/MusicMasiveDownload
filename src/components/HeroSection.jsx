import { motion } from 'framer-motion'
import { HiArrowDown, HiMusicalNote, HiFilm } from 'react-icons/hi2'

export default function HeroSection() {
  return (
    <section className="text-center py-12 sm:py-20 relative">
      {/* Decorative elements */}
      <motion.div
        className="absolute top-10 left-1/4 w-72 h-72 bg-red-600/5 rounded-full blur-3xl"
        animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 8, repeat: Infinity }}
      />
      <motion.div
        className="absolute bottom-10 right-1/4 w-96 h-96 bg-red-500/3 rounded-full blur-3xl"
        animate={{ scale: [1.2, 1, 1.2], opacity: [0.2, 0.4, 0.2] }}
        transition={{ duration: 10, repeat: Infinity }}
      />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="relative z-10"
      >
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="inline-flex items-center gap-3 glass px-5 py-2.5 rounded-full mb-8"
        >
          <HiMusicalNote className="text-red-500 text-sm" />
          <span className="text-xs text-gray-400 tracking-wide">Descarga masiva · YouTube · Facebook · Instagram · TikTok</span>
          <HiFilm className="text-red-500 text-sm" />
        </motion.div>

        {/* Title */}
        <h2 className="text-4xl sm:text-5xl md:text-7xl font-display font-bold mb-6 leading-tight">
          <span className="gradient-text">Descarga</span>
          <br />
          <span className="text-white">de forma </span>
          <span className="gradient-text">masiva</span>
        </h2>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-gray-400 text-base sm:text-lg max-w-2xl mx-auto mb-10 leading-relaxed font-light"
        >
          Pega múltiples links de <span className="text-white font-medium">YouTube</span>, <span className="text-white font-medium">Facebook</span>, <span className="text-white font-medium">Instagram</span> o <span className="text-white font-medium">TikTok</span>.
          Descárgalos todos de una sola vez en <span className="text-red-400 font-medium">MP3</span> o <span className="text-red-400 font-medium">MP4</span>.
        </motion.p>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="flex justify-center gap-8 sm:gap-12"
        >
          {[
            { icon: <HiArrowDown />, label: 'Descarga masiva', value: 'Batch' },
            { icon: <HiMusicalNote />, label: 'Audio MP3', value: 'Alta calidad' },
            { icon: <HiFilm />, label: 'Video MP4', value: 'Hasta 4K' },
          ].map((stat, i) => (
            <div key={i} className="text-center">
              <div className="text-red-500 text-lg mb-1 flex justify-center">{stat.icon}</div>
              <div className="text-white text-sm font-semibold">{stat.value}</div>
              <div className="text-gray-500 text-xs mt-0.5">{stat.label}</div>
            </div>
          ))}
        </motion.div>
      </motion.div>
    </section>
  )
}
