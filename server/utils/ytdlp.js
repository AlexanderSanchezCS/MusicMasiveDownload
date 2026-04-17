const { exec } = require('child_process');

const YTDLP_PATH = '/usr/local/bin/yt-dlp';

exec(`${YTDLP_PATH} --version`, (err, stdout, stderr) => {
  if (err) {
    console.error('Error: yt-dlp is not available.');
    throw new Error('Herramienta de descarga no disponible');
  }
  console.log('yt-dlp version:', stdout);
});

exec('yt-dlp --version', (err, stdout, stderr) => {
  if (err) {
    console.error('Error checking yt-dlp version:', stderr);
    throw new Error('Herramienta de descarga no disponible');
  }
  console.log('yt-dlp version:', stdout);
});

async function getVideoInfo(url) {
  const command = `yt-dlp -j ${url}`;
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error('yt-dlp error:', stderr);
        return reject(error);
      }
      resolve(JSON.parse(stdout));
    });
  });
}

export { getVideoInfo };