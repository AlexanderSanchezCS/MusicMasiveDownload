FROM node:22-slim

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -o /usr/local/bin/yt-dlp && \
    chmod +x /usr/local/bin/yt-dlp

RUN yt-dlp --version && ffmpeg -version

WORKDIR /app

COPY server/package*.json ./
RUN npm ci --only=production

COPY server/ .

RUN ls -la && echo "--- Verificando index.js ---" && ls index.js

ENV YTDLP_PATH=/usr/local/bin/yt-dlp
ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "index.js"]