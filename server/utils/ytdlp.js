import { exec } from 'child_process';

const YTDLP_PATH = process.env.YTDLP_PATH || '/usr/local/bin/yt-dlp';

export async function getVideoInfo(url) {
  return new Promise((resolve, reject) => {
    const command = `${YTDLP_PATH} -j "${url}"`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error('yt-dlp error:', stderr);
        return reject(new Error('Error ejecutando yt-dlp'));
      }

      try {
        const data = JSON.parse(stdout);
        resolve(data);
      } catch (parseError) {
        reject(new Error('Error parseando JSON de yt-dlp'));
      }
    });
  });
}