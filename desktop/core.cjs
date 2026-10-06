const path = require('node:path');
const crypto = require('node:crypto');
const VIDEO = new Set(['.mp4', '.mkv', '.mov', '.avi', '.webm', '.m4v', '.wmv', '.mpg', '.mpeg', '.ts']);
const IMAGE = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp']);
function validName(value) {
  const name = String(value ?? '').trim();
  if (!name || name.length > 120 || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) || name === '.' || name === '..') throw new Error('Choose a valid Windows name (no slashes, reserved names, or trailing dots).');
  return name;
}
function within(root, target) {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}
function episodeInfo(filename) {
  const m = filename.match(/s(\d{1,3})[ ._-]*e(\d{1,4})/i) || filename.match(/(?:^|\D)(\d{1,2})x(\d{1,3})(?:\D|$)/i);
  return m ? { season: Number(m[1]), episode: Number(m[2]) } : { season: null, episode: null };
}
function compareEpisodes(a, b) {
  if (a.order != null || b.order != null) return (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) || a.title.localeCompare(b.title);
  return (a.season ?? 0) - (b.season ?? 0) || (a.episode ?? 0) - (b.episode ?? 0) || a.title.localeCompare(b.title, undefined, { numeric: true });
}
function recommendations(items, current, shuffle = false, random = Math.random) {
  const available = items.filter(i => !i.missing && i.id !== current?.id);
  const seriesNext = current?.series ? available.filter(i => i.series === current.series && compareEpisodes(i, current) > 0).sort(compareEpisodes) : [];
  const seen = new Set(current?.series ? [current.series] : []);
  let rest = available.filter(i => !i.watched).sort((a, b) => Number(b.genre === current?.genre) - Number(a.genre === current?.genre) || compareEpisodes(a, b)).filter(i => {
    if (!i.series) return true;
    if (seen.has(i.series)) return false;
    seen.add(i.series); return true;
  });
  if (shuffle) for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  return [...seriesNext, ...rest];
}
function cinemaAt(hour, start = 19, end = 7) { return start === end || (start > end ? hour >= start || hour < end : hour >= start && hour < end); }
function newId() { return crypto.randomUUID(); }
module.exports = { VIDEO, IMAGE, validName, within, episodeInfo, compareEpisodes, recommendations, cinemaAt, newId };
