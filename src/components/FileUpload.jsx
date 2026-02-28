import { useCallback } from 'react'
import { motion } from 'framer-motion'
import { HiDocumentArrowUp, HiDocumentText } from 'react-icons/hi2'
import useStore from '../store/useStore'
import toast from 'react-hot-toast'

export default function FileUpload() {
  const { processUploadedFile, isProcessing } = useStore()

  const handleDrop = useCallback(async (e) => {
    e.preventDefault()
    const file = e.dataTransfer?.files[0] || e.target?.files[0]
    if (!file) return

    const validTypes = ['text/plain', 'text/csv', 'application/vnd.ms-excel']
    const validExtensions = ['.txt', '.csv']
    const hasValidExt = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext))

    if (!validTypes.includes(file.type) && !hasValidExt) {
      toast.error('Solo se aceptan archivos .txt o .csv')
      return
    }

    toast.success(`Archivo "${file.name}" cargado correctamente`)
    await processUploadedFile(file)
  }, [processUploadedFile])

  const handleDragOver = (e) => {
    e.preventDefault()
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6 }}
      className="glass rounded-2xl p-6 sm:p-8"
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 rounded-lg bg-red-600/20 flex items-center justify-center">
          <HiDocumentText className="text-red-500" />
        </div>
        <div>
          <h3 className="text-white font-semibold text-lg">Subir archivo de links</h3>
          <p className="text-gray-500 text-xs">Sube un archivo .txt o .csv con los links de YouTube</p>
        </div>
      </div>

      <label
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className={`block border-2 border-dashed border-gray-800 rounded-xl p-8 text-center cursor-pointer transition-all duration-300 hover:border-red-500/40 hover:bg-red-500/5 ${
          isProcessing ? 'opacity-50 pointer-events-none' : ''
        }`}
      >
        <input
          type="file"
          accept=".txt,.csv"
          onChange={handleDrop}
          className="hidden"
          disabled={isProcessing}
          aria-label="Subir archivo de links (.txt o .csv)"
        />
        <motion.div
          whileHover={{ scale: 1.05 }}
          className="flex flex-col items-center gap-3"
        >
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-600/10 to-red-500/5 border border-red-500/10 flex items-center justify-center">
            <HiDocumentArrowUp className="text-red-500 text-2xl" />
          </div>
          <div>
            <p className="text-white text-sm font-medium">
              Arrastra un archivo aquí o <span className="text-red-500">haz clic para seleccionar</span>
            </p>
            <p className="text-gray-600 text-xs mt-1">Archivos .txt o .csv • Un link por línea</p>
          </div>
        </motion.div>
      </label>
    </motion.div>
  )
}
