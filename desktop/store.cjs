const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
class Store {
  constructor(directory) {
    fs.mkdirSync(directory, { recursive: true });
    this.db = new DatabaseSync(path.join(directory, 'library.sqlite'));
    this.db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS media (id TEXT PRIMARY KEY, root TEXT NOT NULL, file TEXT NOT NULL, data TEXT NOT NULL, UNIQUE(root,file));');
  }
  get(key, fallback) { const r = this.db.prepare('SELECT value FROM settings WHERE key=?').get(key); return r ? JSON.parse(r.value) : fallback; }
  set(key, value) { this.db.prepare('INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value)); }
  items(root) { return this.db.prepare('SELECT data FROM media WHERE root=?').all(root).map(r => JSON.parse(r.data)); }
  item(id) { const r = this.db.prepare('SELECT data FROM media WHERE id=?').get(id); return r ? JSON.parse(r.data) : null; }
  save(root, item) { this.db.prepare('INSERT INTO media VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET root=excluded.root,file=excluded.file,data=excluded.data').run(item.id, root, item.file, JSON.stringify(item)); }
  close() { this.db.close(); }
}
module.exports = { Store };
