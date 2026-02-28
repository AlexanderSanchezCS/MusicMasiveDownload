# MusicMasiveDownload – Backend Server

Express.js API that uses **yt-dlp** and **ffmpeg** to download YouTube audio/video.

## Prerequisites

| Tool | Min version | Install |
|------|-------------|---------|
| **Node.js** | 18+ | https://nodejs.org |
| **yt-dlp** | latest | `pip install yt-dlp` or [GitHub releases](https://github.com/yt-dlp/yt-dlp) |
| **ffmpeg** | 5+ | https://ffmpeg.org/download.html |

> On **Windows** you can place a local `ffmpeg.exe` inside `server/bin/` and the server will detect it automatically.

## Environment variables

Create a `.env` file in this folder (optional):

```env
PORT=4000                           # Server port (default: 4000)
FRONTEND_URL=http://localhost:5173  # CORS origin (default: *)
YTDLP_PATH=yt-dlp                  # Path to yt-dlp binary (default: yt-dlp in PATH)
NODE_ENV=development                # development | production
```

## Running locally

```bash
cd server
npm install
npm run dev    # starts with --watch for auto-reload
```

The health endpoint should respond at `http://localhost:4000/api/health`.

## Docker

```bash
cd server
docker build -t mmdownload-api .
docker run -p 4000:4000 mmdownload-api
```

The Dockerfile installs yt-dlp and ffmpeg via apt & pip automatically.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/info` | Get video metadata (`{ url }`) |
| `POST` | `/api/download` | Download media (`{ url, format, quality, title? }`) |
| `POST` | `/api/playlist` | Resolve playlist into video list (`{ url }`) |

## Rate Limits

- `/api/info`, `/api/playlist`, `/api/health` → **200 requests / 15 min**
- `/api/download` → **50 requests / 15 min**

## Temp file cleanup

Downloaded files are stored in the system temp directory and automatically cleaned up:
- After streaming to the client
- On client abort
- Every **10 minutes** for files older than **30 minutes** (periodic cron)
