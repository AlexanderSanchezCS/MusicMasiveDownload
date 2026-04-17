FROM node:22-slim

# 🔥 Forzar rebuild (puedes cambiar este valor cuando quieras invalidar cache)
# FORCE REBUILD 2026-04-17-v2

# ─────────────────────────────────────────────
# Instalar dependencias del sistema
# ─────────────────────────────────────────────
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# ─────────────────────────────────────────────
# Instalar yt-dlp correctamente
# ─────────────────────────────────────────────
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -o /usr/local/bin/yt-dlp && \
    chmod +x /usr/local/bin/yt-dlp

# ─────────────────────────────────────────────
# Verificar instalación (IMPORTANTE para debug)
# ─────────────────────────────────────────────
RUN yt-dlp --version && ffmpeg -version

# ─────────────────────────────────────────────
# Directorio de trabajo
# ─────────────────────────────────────────────
WORKDIR /app

# ─────────────────────────────────────────────
# Instalar dependencias Node
# ─────────────────────────────────────────────
COPY package*.json ./
RUN npm ci --only=production

# ─────────────────────────────────────────────
# Copiar código (IMPORTANTE: ya estás en /server como root)
# ─────────────────────────────────────────────
COPY . .

# Debug opcional (puedes quitarlo luego)
RUN ls -la

# ─────────────────────────────────────────────
# Variables de entorno
# ─────────────────────────────────────────────
ENV YTDLP_PATH=/usr/local/bin/yt-dlp
ENV NODE_ENV=production

# ─────────────────────────────────────────────
# Exponer puerto
# ─────────────────────────────────────────────
EXPOSE 8080

# ─────────────────────────────────────────────
# 🚨 ENTRYPOINT CORRECTO (CLAVE DEL FIX)
# ─────────────────────────────────────────────
CMD ["node", "index.js"]