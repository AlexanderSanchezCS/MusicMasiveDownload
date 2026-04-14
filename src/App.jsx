import { Component, lazy, Suspense, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Toaster } from 'react-hot-toast'
import useStore from './store/useStore'
import Header from './components/Header'
import HeroSection from './components/HeroSection'
import PlatformNav from './components/PlatformNav'
import URLInput from './components/URLInput'
import Footer from './components/Footer'
import BackgroundEffects from './components/BackgroundEffects'

// ✅ FIX A — Global Error Boundary to prevent black screen crashes
class ErrorBoundary extends Component {
  state = { hasError: false, error: null }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-black flex items-center justify-center text-white p-8">
          <div className="text-center max-w-md">
            <h2 className="text-2xl font-bold text-red-400 mb-4">
              ⚠️ Algo salió mal
            </h2>
            <p className="text-gray-400 mb-2 text-sm">{this.state.error?.message || 'Error desconocido'}</p>
            <p className="text-gray-600 text-xs mb-6 break-all">{this.state.error?.stack || ''}</p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null })
                window.location.reload()
              }}
              className="px-6 py-2.5 bg-red-600 rounded-xl hover:bg-red-700 transition-colors font-medium text-sm"
            >
              Recargar página
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// Lazy-load heavy components that aren't needed on first paint
const DownloadQueue = lazy(() => import('./components/DownloadQueue'))
const DownloadHistory = lazy(() => import('./components/DownloadHistory'))

// Minimal loading fallback — no animation, instant render
function LazyFallback() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-6 h-6 border-2 border-gray-700 border-t-red-500 rounded-full animate-spin" />
    </div>
  )
}

function App() {
  // PERF: Select only the fields we need to avoid re-rendering on unrelated state changes
  const activeTab = useStore((s) => s.activeTab)
  const setActiveTab = useStore((s) => s.setActiveTab)

  return (
    <ErrorBoundary>
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

          {/* Tabs — reduced animation (no exit animation on initial load) */}
          <div
            className="flex justify-center gap-4 mt-8 mb-10"
            role="tablist"
            aria-label="Secciones principales"
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
                className={`px-6 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                  activeTab === tab.id
                    ? 'btn-glow text-white'
                    : 'glass text-gray-400 hover:text-white hover:border-red-500/30'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {activeTab === 'download' ? (
              <motion.div
                key="download"
                id="panel-download"
                role="tabpanel"
                aria-label="Panel de descargas"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <div className="space-y-8">
                  <URLInput />
                  <Suspense fallback={<LazyFallback />}>
                    <DownloadQueue />
                  </Suspense>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="history"
                id="panel-history"
                role="tabpanel"
                aria-label="Panel de historial"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <Suspense fallback={<LazyFallback />}>
                  <DownloadHistory />
                </Suspense>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        <Footer />
      </div>
    </div>
    </ErrorBoundary>
  )
}

export default App
