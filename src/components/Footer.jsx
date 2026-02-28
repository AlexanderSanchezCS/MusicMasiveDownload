import { motion } from 'framer-motion'
import { HiMusicalNote, HiCodeBracket } from 'react-icons/hi2'

export default function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <motion.footer
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 1 }}
      className="relative z-10 border-t border-white/[0.03] mt-20"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col items-center gap-5">
          {/* Top row */}
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-red-600 to-red-500 flex items-center justify-center">
              <HiMusicalNote className="text-white text-xs" />
            </div>
            <span className="text-sm text-gray-500">
              <span className="text-gray-400">Music</span>
              <span className="text-red-500">Masive</span>
              <span className="text-gray-400">Download</span>
            </span>
          </div>

          {/* Divider */}
          <div className="w-full h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

          {/* Author row */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              <HiCodeBracket className="text-red-500 text-sm" />
              <span className="text-gray-500">Desarrollado por</span>
              <span className="text-white font-semibold tracking-wide">Alexander Sánchez</span>
            </div>
            <span className="hidden sm:inline text-gray-700">•</span>
            <span className="text-gray-600">© {currentYear} Todos los derechos reservados</span>
          </div>
        </div>
      </div>
    </motion.footer>
  )
}
