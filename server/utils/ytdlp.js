import { exec } from 'child_process';

const YTDLP_PATH = process.env.YTDLP_PATH || '/usr/local/bin/yt-dlp';

export async function getVideoInfo(url) {
  return new Promise((resolve, reject) => {

    const command = `${YTDLP_PATH} -j --no-warnings --no-playlist "${url}"`;

    const process = exec(command, { timeout: 20000 }, (error, stdout, stderr) => {

      if (error) {
        console.error('❌ yt-dlp exec error:', error.message);
        console.error('stderr:', stderr);
        return reject(new Error('yt-dlp execution failed'));
      }

      if (!stdout) {
        return reject(new Error('yt-dlp returned empty response'));
      }

      try {
        // 🔥 FIX: limpiar salida (yt-dlp a veces mezcla logs con JSON)
        const jsonStart = stdout.indexOf('{');
        const jsonEnd = stdout.lastIndexOf('}');

        if (jsonStart === -1 || jsonEnd === -1) {
          throw new Error('Invalid JSON output');
        }

        const cleanJson = stdout.slice(jsonStart, jsonEnd + 1);
        const data = JSON.parse(cleanJson);

        resolve(data);

      } catch (err) {
        console.error('❌ JSON parse error:', err.message);
        console.error('RAW OUTPUT:', stdout);
        reject(new Error('Error parsing yt-dlp response'));
      }
    });

    // 🔥 EXTRA: kill si se cuelga
    setTimeout(() => {
      process.kill();
    }, 25000);
  });
}