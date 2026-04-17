import { useState, memo, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { HiLink, HiPlayCircle, HiXMark, HiMusicalNote, HiFilm, HiSparkles, HiChevronDown } from 'react-icons/hi2'
import useStore, { isSupportedUrlForPlatform } from '../store/useStore'
import toast from 'react-hot-toast'

const QUALITIES = {
  mp3: [
    { id: '128',  label: '128',  unit: 'kbps', tag: null },
    { id: '192',  label: '192',  unit: 'kbps', tag: 'Popular' },
    { id: '256',  label: '256',  unit: 'kbps', tag: null },
    { id: '320',  label: '320',  unit: 'kbps', tag: 'HQ' },
  ],
  mp4: [
    { id: '360',  label: '360p',  unit: '', tag: null },
    { id: '480',  label: '480p',  unit: '', tag: null },
    { id: '720',  label: '720p',  unit: '', tag: 'HD' },
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

  const handleDownload = async () => {
    const validUrls = urls.split(/[\n,]+/).map(l => l.trim()).filter(l => l.length > 0);
    if (validUrls.length === 0) {
      toast.error('Ingresa al menos un link válido')
      return
    }

    // Ensure to call the backend API with POST
    try {
      const response = await fetch(buildApiUrl(import.meta.env.VITE_API_URL, 'info'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: validUrls[0] })
      });
      const data = await response.json();
      console.log('Response from API:', data);
      toast.success('Download started!');
    } catch (error) {
      toast.error('Error initiating download');
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className="glass rounded-2xl p-6 sm:p-8"
    >
      {/* Add your UI components */}

      <motion.button
        onClick={handleDownload}
        className="btn"
      >
        Download
      </motion.button>
    </motion.div>
  )
});