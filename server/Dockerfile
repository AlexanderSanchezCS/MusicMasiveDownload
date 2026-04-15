FROM node:20-slim

# Install yt-dlp, ffmpeg, and curl (for health checks)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    && pip3 install --break-system-packages yt-dlp \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Verify yt-dlp installation
RUN yt-dlp --version

WORKDIR /app

# Copy package files and install
COPY package.json package-lock.json* ./
RUN npm install --production

# Copy only necessary server files
COPY index.js ./
COPY routes/ ./routes/
COPY utils/ ./utils/

# Expose port 8080 (Railway default)
EXPOSE 8080

# Start server
CMD ["node", "index.js"]
