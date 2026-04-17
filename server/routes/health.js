const express = require('express');
const { exec } = require('child_process');

const router = express.Router();

router.get('/health', async (req, res) => {
  const yt_dlpStatus = await checkYTDLP();
  const ffmpegStatus = await checkFFmpeg();

  res.json({ yt_dlp: yt_dlpStatus, ffmpeg: ffmpegStatus });
});

async function checkYTDLP() {
  return new Promise((resolve) => {
    exec('/usr/local/bin/yt-dlp --version', (error) => {
      resolve(error ? 'missing' : 'ok');
    });
  });
}

async function checkFFmpeg() {
  return new Promise((resolve) => {
    exec('ffmpeg -version', (error) => {
      resolve(error ? 'missing' : 'ok');
    });
  });
}

module.exports = router;