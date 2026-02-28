import { motion, AnimatePresence } from 'framer-motion'
import { Toaster } from 'react-hot-toast'
import useStore from './store/useStore'
import Header from './components/Header'
import HeroSection from './components/HeroSection'
import PlatformNav from './components/PlatformNav'
import URLInput from './components/URLInput'
import DownloadQueue from './components/DownloadQueue'
import DownloadHistory from './components/DownloadHistory'
import Footer from './components/Footer'
import BackgroundEffects from './components/BackgroundEffects'

function App() {
  const { activeTab, setActiveTab } = useStore()

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      <BackgroundEffects />
      
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: 'rgba(15, 15, 15, 0.95)',
            color: '#fff',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            backdropFilter: 'blur(20px)',
            borderRadius: '12px',
            fontSize: '14px',
          },
          success: {
            iconTheme: { primary: '#ef4444', secondary: '#fff' },
          },
          error: {
            iconTheme: { primary: '#ef4444', secondary: '#fff' },
          },
        }}
      />

      <div className="relative z-10">
        <Header />
        
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
          <HeroSection />
          <PlatformNav />

          {/* Tabs */}
          <motion.div 
            className="flex justify-center gap-4 mt-8 mb-10"
            role="tablist"
            aria-label="Secciones principales"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            {[
              { id: 'download', label: 'Descargar' },
              { id: 'history', label: 'Historial' },
            ].map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`panel-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`px-6 py-3 rounded-xl text-sm font-medium transition-all duration-300 ${
                  activeTab === tab.id
                    ? 'btn-glow text-white'
                    : 'glass text-gray-400 hover:text-white hover:border-red-500/30'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </motion.div>

          <AnimatePresence mode="wait">
            {activeTab === 'download' ? (
              <motion.div
                key="download"
                id="panel-download"
                role="tabpanel"
                aria-label="Panel de descargas"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3 }}
              >
                <div className="space-y-8">
                  <URLInput />
                  <DownloadQueue />
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="history"
                id="panel-history"
                role="tabpanel"
                aria-label="Panel de historial"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                <DownloadHistory />
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        <Footer />
      </div>
    </div>
  )
}

export default App
