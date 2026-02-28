import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import downloadRouter from './routes/download.js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.PORT || 4000

// Security
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}))

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST'],
  credentials: true,
  exposedHeaders: ['Content-Length', 'Content-Disposition'],
}))

// --- Differentiated rate limiting ---
// Light endpoints (info, playlist, health): 200 req / 15 min
const infoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Demasiadas solicitudes de información. Intenta de nuevo en unos minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// Heavy endpoint (download): 50 req / 15 min (each one spawns yt-dlp + ffmpeg)
const downloadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { error: 'Demasiadas descargas. Intenta de nuevo en unos minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
})

app.use('/api/info', infoLimiter)
app.use('/api/playlist', infoLimiter)
app.use('/api/health', infoLimiter)
app.use('/api/download', downloadLimiter)

// Body parser
app.use(express.json({ limit: '10mb' }))

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Routes
app.use('/api', downloadRouter)

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err)
  res.status(500).json({
    error: 'Error interno del servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  })
})

app.listen(PORT, () => {
  console.log(`🎵 MusicMasiveDownload Server running on port ${PORT}`)
  console.log(`   Health: http://localhost:${PORT}/api/health`)
})
