# MusicMasiveDownload

Aplicación web moderna para descargar música y video de YouTube de forma masiva.

## 🎵 Features

- **Descarga masiva**: Pega múltiples links de YouTube y descárgalos todos
- **Soporte de playlists**: Descarga playlists completas con un solo link
- **MP3 & MP4**: Conversión a audio (MP3) o video (MP4)
- **Calidad configurable**: Desde 128kbps hasta 320kbps para audio, hasta 4K para video
- **Subida de archivos**: Sube un .txt o .csv con links para descargar en lote
- **Historial**: Registro de descargas completadas
- **Toast notifications**: Feedback visual inmediato
- **Diseño moderno**: Negro y rojo, glassmorphism, animaciones con Framer Motion

## 🛠️ Tech Stack

### Frontend
- React 18 + Vite
- TailwindCSS
- Framer Motion
- Zustand (state management)
- React Hot Toast

### Backend
- Node.js + Express
- yt-dlp (descargas de YouTube)

## 🚀 Getting Started

### Requisitos previos
- Node.js 18+
- yt-dlp instalado ([instrucciones](https://github.com/yt-dlp/yt-dlp#installation))
- ffmpeg instalado ([instrucciones](https://ffmpeg.org/download.html))

### Frontend

```bash
npm install
npm run dev
```

### Backend

```bash
cd server
npm install
npm run dev
```

## 📦 Deploy

### Frontend → Vercel
1. Conecta el repo a Vercel
2. Framework: Vite
3. Build command: `npm run build`
4. Output: `dist`

### Backend → Railway/Render
1. Root directory: `server`
2. Build: `npm install`
3. Start: `npm start`
4. Asegúrate de tener yt-dlp y ffmpeg en el entorno

### Variables de entorno

**Frontend** (`.env`):
```
VITE_API_URL=https://your-backend-url.railway.app
```

**Backend** (`server/.env`):
```
PORT=4000
FRONTEND_URL=https://your-app.vercel.app
NODE_ENV=production
```

## 📂 Estructura

```
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── vercel.json
├── public/
│   └── favicon.svg
├── src/
│   ├── main.jsx
│   ├── App.jsx
│   ├── index.css
│   ├── store/
│   │   └── useStore.js
│   └── components/
│       ├── Header.jsx
│       ├── HeroSection.jsx
│       ├── URLInput.jsx
│       ├── FileUpload.jsx
│       ├── FormatSelector.jsx
│       ├── DownloadQueue.jsx
│       ├── DownloadHistory.jsx
│       ├── BackgroundEffects.jsx
│       └── Footer.jsx
└── server/
    ├── package.json
    ├── index.js
    ├── .env
    ├── routes/
    │   └── download.js
    └── utils/
        └── ytdlp.js
```
