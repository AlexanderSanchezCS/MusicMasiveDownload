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

// Trust proxy — set to the number of trusted reverse proxies (Railway/Vercel = 1)
// SECURITY: Do NOT set to `true` (trusts all proxies → rate-limit bypass via X-Forwarded-For)
app.set('trust proxy', 1)
const PORT = process.env.PORT || 8080

// Security headers via Helmet
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://va.vercel-scripts.com'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
      connectSrc: ["'self'", 'https://*.railway.app', 'https://*.vercel.app', 'https://va.vercel-scripts.com'],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
}))

// CORS — Allow frontend origins (Vercel) to call Railway directly for downloads.
// Set FRONTEND_URL in Railway env to your Vercel domain(s), comma-separated.
// e.g. FRONTEND_URL=https://music-masive-download.vercel.app,https://music-masive-download-gfv7ttucw.vercel.app
const ALLOWED_ORIGINS = (process.env.FRONTEND_URL || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean)

app.use(cors({
  origin: ALLOWED_ORIGINS.length > 0
    ? (origin, cb) => {
        // Allow requests with no origin (e.g. server-to-server, curl, Vercel rewrite proxy)
        if (!origin) return cb(null, true)
        // Allow exact match or *.vercel.app subdomains for preview deploys
        if (ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.vercel.app')) {
          return cb(null, true)
        }
        cb(new Error('Blocked by CORS'))
      }
    : '*', // fallback for local dev only
  methods: ['GET', 'POST'],
  credentials: false, // no cookies needed for download calls
  exposedHeaders: ['Content-Length', 'Content-Disposition'],
}))

// --- Differentiated rate limiting ---
// Light endpoints (info, playlist, health): 300 req / 15 min per IP
// A user downloading 100 songs makes ~100 info calls over ~30 min → ~50/window
const infoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { error: 'Demasiadas solicitudes de información. Intenta de nuevo en unos minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
})

// Heavy endpoint (download): 150 req / 15 min per IP
// A user downloading 100 songs at 3 concurrent → ~50 downloads per 15 min window
const downloadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 150,
  message: { error: 'Demasiadas descargas. Intenta de nuevo en unos minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
})

app.use('/api/info', infoLimiter)
app.use('/api/playlist', infoLimiter)
app.use('/api/health', infoLimiter)
app.use('/api/download', downloadLimiter)

// Body parser — SECURITY: 1 MB is more than enough for JSON payloads with URLs
app.use(express.json({ limit: '1mb' }))

// ✅ FIX 9 — Conditional request logger: skip body logging for /download routes
app.use((req, res, next) => {
  const start = Date.now()
  const isDownload = req.path.includes('/download')

  // Only log body for non-download endpoints (small payloads)
  if (!isDownload) {
    const bodySummary = req.method === 'POST' && req.body
      ? JSON.stringify(req.body).slice(0, 200)
      : req.method === 'GET'
        ? JSON.stringify(req.query).slice(0, 200)
        : '(no body)'
    console.log(`[req] ${req.method} ${req.originalUrl} | Body: ${bodySummary}`)
  }

  res.on('finish', () => {
    const duration = Date.now() - start
    // Only log finish for non-downloads or slow operations (>5s)
    if (!isDownload || duration > 5000) {
      console.log(`[res] ${req.method} ${req.originalUrl} → ${res.statusCode} (${duration}ms)`)
    }
  })

  next()
})

// Global request timeout (5 minutes — downloads of large files need more time)
app.use((req, res, next) => {
  const timeout = req.path.includes('/download') ? 300000 : 120000
  res.setTimeout(timeout, () => {
    if (!res.headersSent) {
      res.status(408).json({ error: 'La solicitud tardó demasiado.' })
    }
  })
  next()
})

// Health check — includes download queue stats for monitoring
app.get('/api/health', (req, res) => {
  const stats = getDownloadStats()
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    downloads: stats,
    uptime: Math.round(process.uptime()),
    memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
  })
})

// Routes
app.use('/api', downloadRouter)

// CORS rejection handler
app.use((err, req, res, next) => {
  if (err.message === 'Blocked by CORS') {
    return res.status(403).json({ error: 'Origin no permitido.' })
  }
  next(err)
})

// Global error handler — SECURITY: never leak stack traces or internal paths
app.use((err, req, res, next) => {
  console.error('Server error:', err)
  res.status(500).json({
    error: 'Error interno del servidor',
    ...(process.env.NODE_ENV === 'development' && { message: err.message }),
  })
})

// ✅ FIX 1 — app.listen() AFTER all middlewares and routes are registered
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

console.log("🔥 NUEVO DEPLOY ACTIVO 🔥");
