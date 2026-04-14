FROM node:20-slim

# Install yt-dlp and ffmpeg
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    ffmpeg \
    && pip3 install --break-system-packages yt-dlp \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install
COPY package.json package-lock.json* ./
RUN npm install --production

# Copy only necessary server files
COPY index.js ./
COPY routes/ ./routes/
COPY utils/ ./utils/

# Expose port
EXPOSE 4000

# Start server
CMD ["node", "index.js"]
