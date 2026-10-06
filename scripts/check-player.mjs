import { access } from 'node:fs/promises';
await access('vendor/mpv/mpv.exe').catch(() => { throw new Error('Run npm run setup:player before packaging.'); });
