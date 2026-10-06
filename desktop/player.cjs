const { BrowserWindow } = require('electron');
const { spawn } = require('node:child_process');
const net = require('node:net');
const { EventEmitter } = require('node:events');
class Player extends EventEmitter {
  constructor(parent, executable) {
    super(); this.parent = parent; this.executable = executable; this.sequence = 0; this.pending = new Map(); this.rect = null; this.hidden = false;
    this.state = { position: 0, duration: 0, paused: true, volume: 80, speed: 1, tracks: [], loading: false };
    parent.on('move', () => this.layout()); parent.on('resize', () => this.layout());
    parent.on('minimize', () => this.window?.hide()); parent.on('restore', () => this.layout());
  }
  async start() {
    if (this.socket && !this.socket.destroyed) return;
    if (this.starting) return this.starting;
    this.starting = this.initialize().finally(() => { this.starting = null; });
    return this.starting;
  }
  async initialize() {
    this.stopping = false;
    this.window = new BrowserWindow({ parent: this.parent, show: false, frame: false, skipTaskbar: true, focusable: false, backgroundColor: '#090909', resizable: false, webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true } });
    this.window.setIgnoreMouseEvents(true);
    const hwnd = this.window.getNativeWindowHandle().readUInt32LE(0);
    const pipe = `\\\\.\\pipe\\matinee-${process.pid}-${Date.now()}`;
    this.process = spawn(this.executable, [`--wid=${hwnd}`, `--input-ipc-server=${pipe}`, '--idle=yes', '--keep-open=yes', '--force-window=yes', '--no-config', '--no-terminal', '--osc=no', '--input-default-bindings=no', '--input-vo-keyboard=no', '--input-cursor=no', '--cursor-autohide=no', '--hwdec=auto-safe', '--volume=80', '--ytdl=no'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let startupError; this.process.once('error', e => { startupError = e; });
    this.process.stderr.on('data', () => {});
    this.process.once('exit', code => {
      this.socket?.destroy(); this.socket = null;
      for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('Playback engine stopped.')); } this.pending.clear();
      if (this.window && !this.window.isDestroyed()) this.window.destroy(); this.window = null;
      if (!this.stopping) this.emit('failure', `Playback engine stopped (${code}).`);
    });
    try {
      for (let attempt = 0; attempt < 70; attempt++) {
        if (startupError) throw startupError;
        try {
          this.socket = await new Promise((resolve, reject) => { const s = net.createConnection(pipe); s.once('connect', () => { s.removeListener('error', reject); resolve(s); }); s.once('error', reject); });
          break;
        } catch { await new Promise(r => setTimeout(r, 100)); }
      }
      if (!this.socket) throw new Error('Could not connect to the local playback engine.');
      let buffer = '';
      this.socket.on('error', e => this.emit('failure', e.message));
      this.socket.on('data', data => { buffer += data.toString(); let newline; while ((newline = buffer.indexOf('\n')) >= 0) { const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1); try { this.message(JSON.parse(line)); } catch {} } });
      const properties = ['time-pos', 'duration', 'pause', 'volume', 'speed', 'track-list', 'eof-reached', 'mute', 'sub-delay'];
      for (const [id, prop] of properties.entries()) await this.command(['observe_property', id + 1, prop]);
    } catch (e) { this.destroy(); throw new Error(`mpv could not start: ${e.message}. Run npm run setup:player if it is missing.`); }
  }
  message(message) {
    if (message.request_id && this.pending.has(message.request_id)) {
      const p = this.pending.get(message.request_id); this.pending.delete(message.request_id); clearTimeout(p.timer);
      if (message.error === 'success') p.resolve(message.data); else p.reject(new Error(message.error));
    }
    if (message.event === 'property-change') {
      const map = { 'time-pos': 'position', duration: 'duration', pause: 'paused', volume: 'volume', speed: 'speed', 'track-list': 'tracks', mute: 'muted', 'sub-delay': 'subtitleDelay' };
      if (map[message.name] && message.data != null) this.state[map[message.name]] = message.data;
      if (message.name === 'eof-reached' && message.data === false) this.ended = false;
      if (message.name === 'eof-reached' && message.data === true && !this.ended) { this.ended = true; this.emit('ended'); }
      this.emit('state', this.state);
    }
    if (message.event === 'file-loaded') { this.state.loading = false; this.emit('state', this.state); this.emit('loaded'); }
    if (message.event === 'end-file' && message.reason === 'error') { this.state.loading = false; this.emit('failure', message.file_error || 'This video could not be decoded.'); }
  }
  command(command) {
    return new Promise((resolve, reject) => {
      if (!this.socket || this.socket.destroyed) return reject(new Error('The player is not running.'));
      const id = ++this.sequence;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Playback command timed out.')); }, 8000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.write(`${JSON.stringify({ command, request_id: id })}\n`);
    });
  }
  async load(file, position = 0) {
    await this.start(); this.ended = false; this.state = { ...this.state, loading: true, position: 0, duration: 0, tracks: [] };
    await new Promise((resolve,reject) => {
      const cleanup = () => { clearTimeout(timer); this.removeListener('loaded',loaded); this.removeListener('failure',failed); };
      const loaded = () => { cleanup(); resolve(); };
      const failed = error => { cleanup(); reject(new Error(String(error))); };
      const timer = setTimeout(() => failed('Opening the movie timed out.'),20000);
      this.once('loaded',loaded); this.once('failure',failed);
      this.command(['loadfile', file, 'replace', -1, `start=${Math.max(0, position)}`]).catch(failed);
    });
    await this.command(['set_property', 'pause', false]); this.layout();
  }
  viewport(rect) { this.rect = rect; this.layout(); }
  layout() {
    if (!this.window || this.window.isDestroyed()) return;
    if (this.hidden || !this.rect || this.parent.isMinimized() || !this.parent.isVisible()) { this.window.hide(); return; }
    const b = this.parent.getContentBounds(); const r = this.rect;
    this.window.setBounds({ x: Math.round(b.x + r.x), y: Math.round(b.y + r.y), width: Math.max(1, Math.round(r.width)), height: Math.max(1, Math.round(r.height)) });
    this.window.showInactive();
  }
  async stop() { if (this.socket) await this.command(['stop']).catch(() => {}); this.rect = null; this.layout(); }
  destroy() { this.stopping = true; this.socket?.destroy(); this.socket = null; this.process?.kill(); if (this.window && !this.window.isDestroyed()) this.window.destroy(); this.window = null; }
}
module.exports = { Player };
