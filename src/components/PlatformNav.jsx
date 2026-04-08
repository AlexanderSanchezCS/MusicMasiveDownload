import { motion } from 'framer-motion'
import { FaYoutube, FaFacebook, FaInstagram, FaTiktok, FaGlobe } from 'react-icons/fa'
import useStore, { PLATFORMS } from '../store/useStore'

const ICON_MAP = {
  FaGlobe: FaGlobe,
  FaYoutube: FaYoutube,
  FaFacebook: FaFacebook,
  FaInstagram: FaInstagram,
  FaTiktok: FaTiktok,
}

const allTab = { id: 'all', label: 'Todas', icon: 'FaGlobe', color: '#dc2626' }

export default function PlatformNav() {
  const activePlatform = useStore((s) => s.activePlatform)
  const setActivePlatform = useStore((s) => s.setActivePlatform)

  const tabs = [allTab, ...PLATFORMS]

  return (
    <nav
      aria-label="Seleccionar plataforma"
      className="w-full max-w-2xl mx-auto mt-4"
    >
      <div className="flex items-center justify-center gap-1 sm:gap-2 p-1.5 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10">
        {tabs.map((tab) => {
          const isActive = activePlatform === tab.id
          const Icon = ICON_MAP[tab.icon]

          return (
            <motion.button
              key={tab.id}
              onClick={() => setActivePlatform(tab.id)}
              className={`
                relative flex items-center gap-1.5 px-3 py-2 sm:px-4 sm:py-2.5
                rounded-xl text-xs sm:text-sm font-medium transition-all duration-200
                focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400
                ${isActive
                  ? 'text-white shadow-lg'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
                }
              `}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              aria-current={isActive ? 'page' : undefined}
              aria-label={tab.label}
            >
              {isActive && (
                <motion.div
                  layoutId="platform-pill"
                  className="absolute inset-0 rounded-xl"
                  style={{
                    background: tab.id === 'tiktok'
                      ? 'linear-gradient(135deg, #25F4EE, #FE2C55)'
                      : tab.id === 'instagram'
                        ? 'linear-gradient(135deg, #F58529, #DD2A7B, #8134AF)'
                        : tab.color,
                    opacity: 0.9,
                  }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                {Icon && <Icon className="text-base sm:text-lg" />}
                <span className="hidden sm:inline">{tab.label}</span>
              </span>
            </motion.button>
          )
        })}
      </div>
    </nav>
  )
}
