FROM node:22-slim

# Instalar dependencias del sistema
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Instalar yt-dlp
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

# Verificar instalación
RUN yt-dlp --version && ffmpeg -version

WORKDIR /app

COPY . .
RUN npm ci --only=production

ENV YTDLP_PATH=/usr/local/bin/yt-dlp
ENV NODE_ENV=production

EXPOSE 8080
CMD ["node", "server/index.js"]
