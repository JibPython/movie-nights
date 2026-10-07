const { BrowserWindow, screen } = require('electron');
const path = require('node:path');
const { spawn } = require('node:child_process');
const net = require('node:net');
const { EventEmitter } = require('node:events');
class Player extends EventEmitter {
  constructor(parent, executable, {registerWindow = () => {}, miniBounds = null, log = {write() {}}} = {}) {
    super(); this.parent = parent; this.executable = executable; this.sequence = 0; this.pending = new Map(); this.rect = null; this.hidden = false;
    this.mode='default';this.registerWindow=registerWindow;this.miniBounds=miniBounds;this.pinned=false;this.lastMotion=0;
    this.log=log;this.compatibility=false;this.lastProgressLog=0;
    this.state = { position: 0, duration: 0, paused: true, volume: 80, speed: 1, tracks: [], loading: false };
    parent.on('move', () => this.layout()); parent.on('resize', () => this.layout());
    parent.on('show', () => this.layout()); parent.on('enter-full-screen', () => this.layout()); parent.on('leave-full-screen', () => this.layout());
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
    this.lastGeometry=null;
    this.log.write('engine-start',{executable:this.executable,compatibility:this.compatibility});
    try {
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
    this.process = spawn(this.executable, [`--wid=${hwnd}`, `--input-ipc-server=${pipe}`, '--idle=yes', '--keep-open=yes', '--force-window=yes', '--no-config', '--terminal=yes', '--input-terminal=no', '--msg-color=no', '--msg-level=all=warn', '--term-osd=no', '--osc=no', '--input-default-bindings=no', '--input-vo-keyboard=no', '--input-cursor=no', '--cursor-autohide=no', ...(this.compatibility?['--hwdec=no','--vo=gpu,direct3d','--gpu-api=d3d11','--gpu-context=d3d11']:['--hwdec=auto-safe']), '--volume=80', '--ytdl=no'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const child=this.process;
    let startupError; this.process.once('error', e => { startupError = e; });
    for(const stream of [child.stdout,child.stderr])stream.on('data',data=>this.log.write('engine-output',{text:data.toString().slice(-6000)}));
    child.once('exit', (code,signal) => {
      this.log.write('engine-exit',{code,signal,expected:this.process!==child||this.stopping});
      if(this.process!==child)return;
      startupError=new Error(`Playback engine stopped (${code??signal}).`);
      const unexpected=!this.stopping;
      this.destroy();
      if(unexpected)this.fail(`${startupError.message} Try Compatibility playback in Settings, then open the video again.`);
    });
      for (let attempt = 0; attempt < 70; attempt++) {
        if (startupError) throw startupError;
        try {
          this.socket = await new Promise((resolve, reject) => { const s = net.createConnection(pipe); s.once('connect', () => { s.removeListener('error', reject); resolve(s); }); s.once('error', reject); });
          break;
        } catch { await new Promise(r => setTimeout(r, 100)); }
      }
      if (!this.socket) throw new Error('Could not connect to the local playback engine.');
      let buffer = '';
      const connected=this.socket;
      this.socket.on('error', e => {if(this.socket===connected){this.destroy();this.fail(`Lost the playback connection: ${e.message}. Open the video again.`);}});
      this.socket.on('close',()=>{if(this.socket===connected){this.destroy();this.fail('Lost the playback connection. Open the video again.');}});
      this.socket.on('data', data => { if(this.socket!==connected)return;buffer += data.toString(); let newline; while ((newline = buffer.indexOf('\n')) >= 0) { const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1); try { this.message(JSON.parse(line)); } catch {} } });
      const properties = ['time-pos', 'duration', 'pause', 'volume', 'speed', 'track-list', 'eof-reached', 'mute', 'sub-delay','current-vo','current-ao','hwdec-current','video-params','audio-params'];
      for (const [id, prop] of properties.entries()) await this.command(['observe_property', id + 1, prop]);
      this.log.write('engine-connected');
    } catch (e) { this.destroy();this.log.write('startup-failed',{message:e.message});throw new Error(`Astra could not start its playback engine: ${e.message}. If the player is missing, reinstall Astra. Details are in Settings > Open playback log.`); }
  }
  fail(message) {
    this.state={...this.state,loading:false,paused:true};
    this.log.write('playback-failed',{message});this.emit('state',this.state);this.emit('failure',`${message} Details are in Settings > Open playback log.`);
  }
  message(message) {
    if (message.request_id && this.pending.has(message.request_id)) {
      const p = this.pending.get(message.request_id); this.pending.delete(message.request_id); clearTimeout(p.timer);
      if (message.error === 'success') p.resolve(message.data); else p.reject(new Error(message.error));
    }
    if (message.event === 'property-change') {
      if((message.name==='time-pos'&&Number.isFinite(message.data)&&Math.abs(message.data-this.state.position)>.01)||message.name==='pause')this.lastAdvance=Date.now();
      if(['current-vo','current-ao','hwdec-current','video-params','audio-params'].includes(message.name))this.log.write('output',{name:message.name,value:message.data??null});
      const map = { 'time-pos': 'position', duration: 'duration', pause: 'paused', volume: 'volume', speed: 'speed', 'track-list': 'tracks', mute: 'muted', 'sub-delay': 'subtitleDelay' };
      if (map[message.name] && message.data != null) this.state[map[message.name]] = message.data;
      if (message.name === 'eof-reached' && message.data === false) this.ended = false;
      if (message.name === 'eof-reached' && message.data === true && !this.ended) { this.ended = true; this.emit('ended'); }
      this.emit('state', this.state);
      if(message.name==='time-pos'&&Date.now()-this.lastProgressLog>=5000){this.lastProgressLog=Date.now();this.log.write('progress',{position:this.state.position,duration:this.state.duration,paused:this.state.paused,volume:this.state.volume,muted:this.state.muted});}
    }
    if (message.event === 'file-loaded') { this.state.loading = false;this.log.write('file-loaded'); this.emit('state', this.state); this.emit('loaded'); }
    if (message.event === 'end-file')this.log.write('end-file',{reason:message.reason,error:message.file_error});
    if (message.event === 'end-file' && message.reason === 'error') this.fail(message.file_error || 'This video could not be decoded. Try Compatibility playback in Settings.');
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
  async load(file, position = 0, {compatibility=false} = {}) {
    if(this.compatibility!==compatibility){this.destroy();this.compatibility=compatibility;}
    this.log.write('load',{extension:path.extname(file),position,compatibility});
    this.ended = false; this.state = { ...this.state, loading: true, paused:true, position: 0, duration: 0, tracks: [] };this.emit('state',this.state);
    try {
    await this.start();
    if(this.mode!=='default')await this.setMode(this.mode);
    await new Promise((resolve,reject) => {
      const cleanup = () => { clearTimeout(timer); this.removeListener('loaded',loaded); this.removeListener('failure',failed); };
      const loaded = () => { cleanup(); resolve(); };
      const failed = error => { cleanup(); reject(new Error(String(error))); };
      const timer = setTimeout(() => failed('Opening the movie timed out.'),20000);
      this.once('loaded',loaded); this.once('failure',failed);
      this.command(['loadfile', file, 'replace', -1, `start=${Math.max(0, position)}`]).catch(failed);
    });
    await this.command(['set_property', 'pause', false]);
    // mpv need not emit a property change when it was already unpaused.
    this.state.paused=false;this.emit('state',this.state);this.layout();
    this.lastAdvance=Date.now();clearInterval(this.progressWatchdog);
    this.progressWatchdog=setInterval(()=>{
      if(this.state.paused||this.state.loading||this.ended){this.lastAdvance=Date.now();return;}
      if(Date.now()-this.lastAdvance>15000){clearInterval(this.progressWatchdog);this.fail('Playback is not advancing. Try Compatibility playback in Settings, then open the video again.');}
    },1000);
    }catch(error){
      await this.command(['stop']).catch(()=>{});
      this.state={...this.state,loading:false,paused:true,position:0,duration:0,tracks:[]};this.emit('state',this.state);
      this.log.write('load-failed',{message:error.message});throw error;
    }
  }
  viewport(rect) { this.rect = rect; this.layout(); }
  layout() {
    if (!this.window || this.window.isDestroyed()) return;
    const visible=!(this.hidden || (this.mode!=='mini'&&((this.mode==='default'&&!this.rect) || this.parent.isMinimized() || !this.parent.isVisible())));
    const geometry=JSON.stringify({visible,mode:this.mode,rect:this.rect,parent:this.parent.getContentBounds(),hidden:this.hidden});
    if(geometry!==this.lastGeometry){this.lastGeometry=geometry;this.log.write('video-window',JSON.parse(geometry));}
    if(!visible){this.window.hide();this.overlay?.hide(); return;}
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
  async stop() {
    clearInterval(this.progressWatchdog);if (this.socket) await this.command(['stop']).catch(() => {});
    this.state={...this.state,loading:false,paused:true,position:0,duration:0,tracks:[]};this.emit('state',this.state);
    this.mode='default';this.parent.setFullScreen(false);this.rect=null;this.window?.hide();this.overlay?.hide();
  }
  destroy() {
    this.stopping=true;clearInterval(this.hoverTimer);clearInterval(this.progressWatchdog);
    const socket=this.socket,child=this.process;this.socket=null;this.process=null;
    socket?.destroy();child?.kill();
    for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error('Playback engine stopped.'));}this.pending.clear();
    if(this.overlay&&!this.overlay.isDestroyed())this.overlay.destroy();this.overlay=null;
    if(this.window&&!this.window.isDestroyed())this.window.destroy();this.window=null;
  }
}
module.exports = { Player };
