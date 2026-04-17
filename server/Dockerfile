FROM node:22-slim

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

RUN curl -Lo /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

RUN yt-dlp --version && ffmpeg -version
RUN ffmpeg -version

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

RUN ls -la

ENV YTDLP_PATH=/usr/local/bin/yt-dlp
ENV NODE_ENV=production

EXPOSE 8080
CMD ["node", "index.js"]
