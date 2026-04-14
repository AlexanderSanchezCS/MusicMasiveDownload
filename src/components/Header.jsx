import { memo } from 'react'
import { motion } from 'framer-motion'
import { HiMusicalNote, HiArrowDown } from 'react-icons/hi2'

export default memo(function Header() {
  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="w-full py-6 px-4 sm:px-6 lg:px-8"
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600 to-red-500 flex items-center justify-center shadow-lg shadow-red-500/20">
              <HiMusicalNote className="text-white text-xl" />
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-md bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center">
              <HiArrowDown className="text-white text-[10px]" />
            </div>
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight">
              <span className="text-white">Music</span>
              <span className="gradient-text">Masive</span>
              <span className="text-white">Download</span>
            </h1>
            <p className="text-[10px] text-gray-500 tracking-widest uppercase">Multi-Platform Batch Downloader</p>
          </div>
        </div>

        {/* Status indicator */}
        <div className="hidden sm:flex items-center gap-2 glass px-4 py-2 rounded-full" role="status" aria-label="Estado del servidor: en línea">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" aria-hidden="true"></div>
          <span className="text-xs text-gray-400">Online</span>
        </div>
      </div>
    </motion.header>
  )
})
