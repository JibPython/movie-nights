const { BrowserWindow, screen } = require('electron');
const path = require('node:path');
const { spawn } = require('node:child_process');
const net = require('node:net');
const { EventEmitter } = require('node:events');
class Player extends EventEmitter {
  constructor(parent, executable, {registerWindow = () => {}, miniBounds = null} = {}) {
    super(); this.parent = parent; this.executable = executable; this.sequence = 0; this.pending = new Map(); this.rect = null; this.hidden = false;
    this.mode='default';this.registerWindow=registerWindow;this.miniBounds=miniBounds;this.pinned=false;this.lastMotion=0;
    this.state = { position: 0, duration: 0, paused: true, volume: 80, speed: 1, tracks: [], loading: false };
    parent.on('move', () => this.layout()); parent.on('resize', () => this.layout());
    parent.on('minimize', () => {if(this.mode!=='mini'){this.window?.hide();this.overlay?.hide();}}); parent.on('restore', () => this.layout());
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
    this.window.on('move',()=>{if(this.mode==='mini'){this.alignOverlay();this.saveMiniBounds();}});
    this.window.on('resize',()=>{this.alignOverlay();if(this.mode==='mini')this.saveMiniBounds();});
    this.overlay = new BrowserWindow({parent:this.window,show:false,frame:false,transparent:true,backgroundColor:'#00000000',skipTaskbar:true,resizable:false,hasShadow:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false}});
    this.registerWindow(this.overlay,'controls');
    this.overlay.on('will-move',(event,bounds)=>{if(this.mode==='mini'){event.preventDefault();this.window.setPosition(bounds.x,bounds.y);}});
    await this.overlay.loadFile(path.resolve(__dirname,'../dist/index.html'),{query:{surface:'controls'}});
    this.hoverTimer=setInterval(()=>this.checkHover(),100);
    const hwnd = this.window.getNativeWindowHandle().readUInt32LE(0);
    const pipe = `\\\\.\\pipe\\astra-${process.pid}-${Date.now()}`;
    this.process = spawn(this.executable, [`--wid=${hwnd}`, `--input-ipc-server=${pipe}`, '--idle=yes', '--keep-open=yes', '--force-window=yes', '--no-config', '--no-terminal', '--osc=no', '--input-default-bindings=no', '--input-vo-keyboard=no', '--input-cursor=no', '--cursor-autohide=no', '--hwdec=auto-safe', '--volume=80', '--ytdl=no'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let startupError; this.process.once('error', e => { startupError = e; });
    this.process.stderr.on('data', () => {});
    this.process.once('exit', code => {
      this.socket?.destroy(); this.socket = null;
      clearInterval(this.hoverTimer);if(this.overlay&&!this.overlay.isDestroyed())this.overlay.destroy();this.overlay=null;
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
    if (this.hidden || (this.mode!=='mini'&&(!this.rect || this.parent.isMinimized() || !this.parent.isVisible()))) { this.window.hide();this.overlay?.hide(); return; }
    if(this.mode!=='mini') {
      const b = this.parent.getContentBounds(); const r = this.mode==='fullscreen'?{x:0,y:0,width:b.width,height:b.height}:this.rect;
      this.window.setBounds({ x: Math.round(b.x + r.x), y: Math.round(b.y + r.y), width: Math.max(1, Math.round(r.width)), height: Math.max(1, Math.round(r.height)) });
    }
    this.window.showInactive();
    if(this.mode==='mini')this.window.setAlwaysOnTop(true);
    this.alignOverlay();this.checkHover();
  }
  alignOverlay() { if(this.overlay&&!this.overlay.isDestroyed()&&this.window&&!this.window.isDestroyed())this.overlay.setBounds(this.window.getContentBounds()); }
  saveMiniBounds() { this.miniBounds=this.window.getBounds();this.emit('mini-bounds',this.miniBounds); }
  checkHover() {
    if(!this.overlay||this.overlay.isDestroyed()||!this.window||!this.window.isVisible()||this.hidden||this.mode==='default'){this.overlay?.hide();return;}
    const b=this.window.getBounds(),p=screen.getCursorScreenPoint();
    const inside=p.x>=b.x&&p.x<=b.x+b.width&&p.y>=b.y&&p.y<=b.y+b.height;
    if(inside&&(!this.lastCursor||this.lastCursor.x!==p.x||this.lastCursor.y!==p.y))this.lastMotion=Date.now();
    this.lastCursor=p;
    const visible=this.pinned||(inside&&Date.now()-this.lastMotion<2500);
    if(visible&&!this.overlay.isVisible()){this.overlay.showInactive();if(this.mode==='mini'){this.window.setAlwaysOnTop(true);this.overlay.setAlwaysOnTop(true);}}else if(!visible&&this.overlay.isVisible())this.overlay.hide();
  }
  async setMode(mode) {
    if(!['default','fullscreen','mini'].includes(mode))throw new Error('Invalid player mode.');
    if(!this.window)throw new Error('Play a video first.');
    this.mode=mode;this.pinned=false;this.lastMotion=Date.now();
    await this.command(['set_property','ontop',mode==='mini']);
    this.parent.setFullScreen(mode==='fullscreen');
    this.window.setParentWindow(mode==='mini'?null:this.parent);
    this.window.setResizable(mode==='mini');this.window.setFocusable(mode==='mini');
    if(mode==='mini') {
      const area=screen.getDisplayMatching(this.miniBounds??this.parent.getBounds()).workArea;
      const saved=this.miniBounds??{width:480,height:270,x:area.x+area.width-504,y:area.y+area.height-294};
      const width=Math.min(area.width,Math.max(320,saved.width)),height=Math.min(area.height,Math.max(180,saved.height));
      this.window.setMinimumSize(320,180);
      this.window.setBounds({x:Math.max(area.x,Math.min(saved.x,area.x+area.width-width)),y:Math.max(area.y,Math.min(saved.y,area.y+area.height-height)),width,height});
    } else {this.window.setMinimumSize(1,1);if(this.parent.isMinimized())this.parent.restore();this.parent.show();this.parent.focus();}
    this.window.setAlwaysOnTop(mode==='mini');this.overlay.setAlwaysOnTop(mode==='mini');
    this.emit('mode',mode);this.layout();
  }
  async stop() { if (this.socket) await this.command(['stop']).catch(() => {});this.mode='default';this.parent.setFullScreen(false);this.rect=null;this.window?.hide();this.overlay?.hide(); }
  destroy() { this.stopping = true;clearInterval(this.hoverTimer);this.socket?.destroy();this.socket=null;this.process?.kill();if(this.overlay&&!this.overlay.isDestroyed())this.overlay.destroy();this.overlay=null;if(this.window&&!this.window.isDestroyed())this.window.destroy();this.window=null; }
}
module.exports = { Player };
