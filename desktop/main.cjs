const { app, BrowserWindow, ipcMain, dialog, protocol, net, powerSaveBlocker } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { Store } = require('./store.cjs');
const { Library } = require('./library.cjs');
const { Player } = require('./player.cjs');
const { within, newId } = require('./core.cjs');
const smoke = process.argv.includes('--smoke-test');
const testSession = process.argv.includes('--test-session');
if (smoke || testSession) app.setPath('userData', path.resolve('.test-output', testSession ? 'integration-profile' : 'profile'));
protocol.registerSchemesAsPrivileged([{ scheme: 'art', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
let main, store, library, player, currentId, blocker, progressTimer;
const defaults = { theme: 'auto', cinemaStart: 19, cinemaEnd: 7, autoplay: true, shuffle: false, repeat: 'off', volume: 80, speed: 1, textScale: 125 };
const selections = new Map();
function send(event, data) { if (main && !main.isDestroyed()) main.webContents.send(event, data); }
function queueKey() { return `queue:${library.root}`; }
function snapshot() { return { root: library.root, items: library.items(), queue: store.get(queueKey(), []).filter(id => { const item = store.item(id); return item?.root === library.root && !item.missing; }), settings: { ...defaults, ...store.get('preferences', {}) }, playerReady: fs.existsSync(player.executable) }; }
function saveProgress(ended = false) { if (currentId) library.progressFor(currentId, player.state.position ?? 0, player.state.duration ?? 0, ended); }
async function nativeDialog(options) { player.hidden = true; player.layout(); try { return await dialog.showOpenDialog(main, options); } finally { player.hidden = false; player.layout(); } }
async function action(method, ...args) {
  switch (method) {
    case 'snapshot': return snapshot();
    case 'chooseRoot': {
      if (library.busy) throw new Error('Wait for the library operation to finish.');
      const result = await nativeDialog({ title: 'Choose your movie library', properties: ['openDirectory'] });
      if (!result.canceled) { saveProgress(); currentId = null; await player.stop(); store.set('root', await fsp.realpath(result.filePaths[0])); await library.scan(); }
      return snapshot();
    }
    case 'scan': await library.scan(); return snapshot();
    case 'pick': {
      const kind = args[0];
      const filters = { video: [{ name: 'Movies', extensions: ['mp4','mkv','mov','avi','webm','m4v','wmv','mpg','mpeg','ts'] }], cover: [{ name: 'Cover artwork', extensions: ['jpg','jpeg','png','webp','bmp'] }], subtitle: [{ name: 'Subtitles', extensions: ['srt','ass','ssa','vtt'] }] };
      if (!filters[kind]) throw new Error('Unknown file type.');
      const result = await nativeDialog({ properties: ['openFile'], filters: filters[kind] });
      if (result.canceled) return null;
      const token = newId(); selections.set(token, { file: result.filePaths[0], kind });
      if (kind === 'subtitle') await player.command(['sub-add', result.filePaths[0], 'select']);
      return { token, name: path.basename(result.filePaths[0]) };
    }
    case 'importMovie': {
      const input = args[0]; const video = selections.get(input.videoToken); const cover = selections.get(input.coverToken);
      if (!video || video.kind !== 'video' || (input.coverToken && cover?.kind !== 'cover')) throw new Error('Select the local files again.');
      await library.importMovie({ ...input, video: video.file, cover: cover?.file });
      selections.delete(input.videoToken); selections.delete(input.coverToken); return snapshot();
    }
    case 'cancelImport': library.importController?.abort(); return;
    case 'edit': {
      if (args[0] === currentId) throw new Error('Return to the library before renaming the playing title.');
      const changes = { ...args[1] };
      if (changes.coverToken) { const cover = selections.get(changes.coverToken); if (cover?.kind !== 'cover') throw new Error('Select the cover again.'); changes.coverSource = cover.file; }
      await library.edit(args[0], changes); return snapshot();
    }
    case 'markWatched': { const item = store.item(args[0]); if (!item || item.root !== library.root) throw new Error('Title not found.'); store.save(item.root, { ...item, watched: Boolean(args[1]), position: args[1] ? item.position : 0 }); return snapshot(); }
    case 'queue': {
      const ids = args[0]; if (!Array.isArray(ids) || ids.length > 10000 || ids.some(id => store.item(id)?.root !== library.root)) throw new Error('Invalid queue.');
      store.set(queueKey(), [...new Set(ids)]); return store.get(queueKey(), []);
    }
    case 'settings': {
      const input = args[0]; const prefs = { ...defaults, ...store.get('preferences', {}) };
      if (input.theme != null) { if (!['auto','warm','cinema'].includes(input.theme)) throw new Error('Invalid theme.'); prefs.theme = input.theme; }
      if (input.textScale != null) {
        if (!Number.isInteger(input.textScale) || input.textScale < 100 || input.textScale > 200 || input.textScale % 5 !== 0) throw new Error('Text size must be 100–200% in steps of 5%.');
        prefs.textScale = input.textScale;
      }
      for (const key of ['cinemaStart','cinemaEnd']) if (input[key] != null) { if (!Number.isInteger(input[key]) || input[key] < 0 || input[key] > 23) throw new Error('Schedule hours must be 0–23.'); prefs[key] = input[key]; }
      for (const key of ['autoplay','shuffle']) if (input[key] != null) prefs[key] = Boolean(input[key]);
      if (input.repeat != null) { if (!['off','one','queue'].includes(input.repeat)) throw new Error('Invalid repeat mode.'); prefs.repeat = input.repeat; }
      for (const [key, min, max] of [['volume',0,100],['speed',.25,3]]) if (input[key] != null) { if (!Number.isFinite(input[key]) || input[key] < min || input[key] > max) throw new Error(`Invalid ${key}.`); prefs[key] = input[key]; }
      store.set('preferences', prefs); return prefs;
    }
    case 'play': {
      const item = store.item(args[0]); const file = await library.absolute(item); saveProgress(); currentId = null;
      await player.load(file, item.watched ? 0 : item.position); currentId = item.id;
      const entries = await fsp.readdir(path.dirname(file),{withFileTypes:true});
      for (const entry of entries.filter(e=>e.isFile()&&/^subtitles(?:\.[a-z0-9_-]+)*\.(srt|ass|ssa|vtt)$/i.test(e.name))) {
        await player.command(['sub-add',path.join(path.dirname(file),entry.name),'auto']).catch(()=>{});
      }
      const prefs = { ...defaults, ...store.get('preferences', {}) };
      await player.command(['set_property', 'volume', prefs.volume]); await player.command(['set_property', 'speed', prefs.speed]); send('library',snapshot()); return item;
    }
    case 'stop': saveProgress(); currentId = null; await player.stop(); if (blocker != null && powerSaveBlocker.isStarted(blocker)) powerSaveBlocker.stop(blocker); return snapshot();
    case 'control': {
      const [name, value] = args;
      if (name === 'pause') return player.command(['cycle','pause']);
      if (name === 'mute') return player.command(['cycle','mute']);
      const controls = { seek: ['seek', value, 'absolute+exact'], volume: ['set_property','volume',value], speed: ['set_property','speed',value], subtitle: ['set_property','sid',value], audio: ['set_property','aid',value], subtitleDelay: ['set_property','sub-delay',value] };
      if (!controls[name]) throw new Error('Unknown player control.');
      if (name === 'subtitle' && value === 'no') {} else if (!Number.isFinite(value)) throw new Error('Invalid control value.');
      if ((name === 'volume' && (value < 0 || value > 100)) || (name === 'speed' && (value < .25 || value > 3)) || (name === 'seek' && value < 0)) throw new Error('Control value is out of range.');
      return player.command(controls[name]);
    }
    case 'viewport': {
      const r = args[0]; if (r == null) { player.viewport(null); return; }
      if (!['x','y','width','height'].every(k => Number.isFinite(r[k])) || r.width < 1 || r.height < 1) return;
      const b = main.getContentBounds(); const x = Math.max(0,Math.min(b.width-1,r.x)); const y = Math.max(0,Math.min(b.height-1,r.y));
      player.viewport({ x, y, width: Math.min(b.width-x,r.width), height: Math.min(b.height-y,r.height) }); return;
    }
    case 'obscure': player.hidden = Boolean(args[0]); player.layout(); return;
    case 'fullscreen': main.setFullScreen(Boolean(args[0])); return;
    case 'window': if (args[0] === 'minimize') main.minimize(); else if (args[0] === 'maximize') main.isMaximized() ? main.unmaximize() : main.maximize(); else if (args[0] === 'close') main.close(); return;
    default: throw new Error('Unknown app action.');
  }
}
app.whenReady().then(async () => {
  store = new Store(app.getPath('userData'));
  library = new Library(store, data => send('progress', data));
  main = new BrowserWindow({ width: 1440, height: 960, minWidth: 960, minHeight: 640, frame: false, show: false, backgroundColor: '#f4f0e8', title: 'Matinee', icon:path.resolve(__dirname,'../assets/matinee.ico'), webPreferences: { preload: path.join(__dirname,'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true } });
  main.setMenu(null);
  player = new Player(main, app.isPackaged ? path.join(process.resourcesPath,'mpv','mpv.exe') : path.resolve(__dirname,'../vendor/mpv/mpv.exe'));
  protocol.handle('art', async request => {
    try {
      const id = new URL(request.url).hostname; const item = store.item(id);
      if (!item || item.root !== library.root || !item.cover) return new Response('', { status: 404 });
      const absolute = await fsp.realpath(path.resolve(library.root,item.cover));
      if (!within(await fsp.realpath(library.root),absolute)) return new Response('', { status: 403 });
      return net.fetch(pathToFileURL(absolute).toString());
    } catch { return new Response('', { status: 404 }); }
  });
  ipcMain.handle('matinee', async (event, method, ...args) => {
    if (event.sender !== main.webContents || event.senderFrame !== main.webContents.mainFrame) throw new Error('Untrusted request.');
    try { return await action(method, ...args); } catch (e) { throw new Error(e.message); }
  });
  main.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  main.webContents.on('will-navigate', e => e.preventDefault());
  main.webContents.session.setPermissionRequestHandler((_, __, callback) => callback(false));
  // Runtime is local-only, including requests originating from the renderer.
  main.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*','https://*/*','ws://*/*','wss://*/*'] }, (_, callback) => callback({ cancel: true }));
  player.on('state', state => {
    send('player', state);
    if (!state.paused && currentId && (blocker == null || !powerSaveBlocker.isStarted(blocker))) blocker = powerSaveBlocker.start('prevent-display-sleep');
    else if (state.paused && blocker != null && powerSaveBlocker.isStarted(blocker)) powerSaveBlocker.stop(blocker);
  });
  player.on('ended', () => { saveProgress(true); send('library',snapshot()); send('ended'); });
  player.on('failure', error => send('failure', error));
  main.on('enter-full-screen', () => send('fullscreen',true)); main.on('leave-full-screen', () => send('fullscreen',false));
  main.on('close', () => { saveProgress(); clearInterval(progressTimer); player.destroy(); });
  await main.loadFile(path.resolve(__dirname,'../dist/index.html'));
  if (!smoke && !testSession) main.show();
  progressTimer = setInterval(() => saveProgress(), 5000);
  if (library.root && !smoke) library.scan().then(() => send('library',snapshot())).catch(e => send('failure', e.message));
  if (smoke) {
    try {
      await new Promise(r => setTimeout(r, 700));
      const content = await main.webContents.executeJavaScript('document.body.innerText');
      if (!content.includes('Matinee')) throw new Error('Renderer did not mount.');
      if (process.env.MATINEE_SMOKE_MEDIA) {
        player.viewport({ x: 100, y: 100, width: 640, height: 360 });
        await player.load(process.env.MATINEE_SMOKE_MEDIA);
        await new Promise(r => setTimeout(r, 2000));
        const duration = await player.command(['get_property','duration']);
        await player.command(['set_property','pause',true]);
        await player.command(['seek',1,'absolute']);
        await player.command(['set_property','speed',1.5]);
        await player.command(['screenshot-to-file',path.resolve('.test-output/decoded-frame.png'),'video']);
        if (!(duration > 0)) throw new Error('No media duration returned.');
        console.log(`Native playback passed: duration=${duration}, pause/seek/speed commands accepted.`);
      }
      await fsp.mkdir(path.resolve('.test-output'), { recursive: true });
      await fsp.writeFile(path.resolve('.test-output/desktop.png'), (await main.webContents.capturePage()).toPNG());
      console.log('Desktop smoke test passed: renderer, preload bridge, SQLite, screenshot.'); main.close(); app.exit(0);
    } catch (e) { console.error(e); player.destroy(); app.exit(1); }
  }
});
app.on('window-all-closed', () => app.quit());
