const fs = require('node:fs');
const path = require('node:path');

// Two bounded files, local to the active profile. Logging must never stop playback.
class PlaybackLog {
  constructor(directory, maxBytes = 512 * 1024) {
    this.file = path.join(directory, 'playback.log');
    this.previous = path.join(directory, 'playback.previous.log');
    this.maxBytes = maxBytes;
  }
  write(event, details = {}) {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const limit=Math.max(0,Math.min(6000,Math.floor(this.maxBytes/4)-128));
      const line = `${new Date().toISOString()} ${String(event).slice(0,80)} ${JSON.stringify(details).slice(0, limit)}\n`;
      if (fs.existsSync(this.file) && fs.statSync(this.file).size + Buffer.byteLength(line) > this.maxBytes) {
        fs.copyFileSync(this.file, this.previous);
        fs.writeFileSync(this.file, '');
      }
      fs.appendFileSync(this.file, line);
    } catch { /* Read-only/full disks must not break the player. */ }
  }
}
module.exports = { PlaybackLog };
