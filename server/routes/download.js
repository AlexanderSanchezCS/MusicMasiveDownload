import { Router } from 'express'
import { Readable } from 'stream'
import { getVideoInfo } from '../utils/ytdlp.js'

const router = Router()

// ─── Shared POST handler for /info ───────────────────────────────────────

router.get('/info', (req, res) => {
  console.warn('[GET /api/info] 405 — Method Not Allowed');
  return res.status(405).json({ error: 'Use POST method' });
});

async function handleInfo(req, res) {
  const incomingUrl = req.body?.url;

  if (!incomingUrl) {
    console.warn('[POST /api/info] 400 — URL is required');
    return res.status(400).json({ error: 'URL is required' });
  }

  req.body.url = incomingUrl.trim(); // Trimming URL

  // Debug logging
  console.log(`[POST /api/info] Incoming URL: ${req.body.url || '(missing)'}`);

  if (!isValidUrl(req.body.url)) {
    console.warn(`[POST /api/info] 400 — Invalid URL: ${req.body.url.slice(0, 80)}`);
    return res.status(400).json({ error: 'Invalid URL. Supported platforms: YouTube, Facebook, Instagram, TikTok.' });
  }

  try {
    const info = await getVideoInfo(req.body.url);
    res.set('Cache-Control', 'public, max-age=180, stale-while-revalidate=30');
    res.set('ETag', `"${Buffer.from(req.body.url).toString('base64url')}"`);
    res.json({ received: req.body, success: true, info });
  } catch (error) {
    console.error('[POST /api/info] 500 —', error.message);
    res.status(500).json({ error: 'Error fetching video information' });
  }
}

router.post('/info', handleInfo);

export default router;