const { app, BrowserWindow, ipcMain, dialog, protocol, net, powerSaveBlocker, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { Store } = require('./store.cjs');
const { Library } = require('./library.cjs');
const { Player } = require('./player.cjs');
const { Sequence } = require('./sequence.cjs');
const { migrateProfile } = require('./migrate.cjs');
const { VIDEO, within, newId } = require('./core.cjs');
const smoke = process.argv.includes('--smoke-test');
const testSession = process.argv.includes('--test-session');
app.setName('Astra');
const profile = smoke || testSession ? path.resolve('.test-output',testSession?'astra-integration-profile':'astra-smoke-profile') : path.join(app.getPath('appData'),'Astra');
app.setPath('userData',profile);
if(!app.requestSingleInstanceLock()){app.quit();return;}
protocol.registerSchemesAsPrivileged([{ scheme:'art', privileges:{standard:true,secure:true,supportFetchAPI:true} }]);
let main,store,library,player,sequence,blocker,progressTimer,countdownTimer,countdown=null,opening=false;
let operations=Promise.resolve();
const windows=new Map();const selections=new Map();
const defaults={theme:'auto',cinemaStart:19,cinemaEnd:7,autoplay:true,shuffle:false,repeat:'off',volume:80,speed:1,textScale:125};
function preferences(){const prefs={...defaults,...store.get('preferences',{})};if(prefs.repeat==='queue')prefs.repeat='all';return prefs;}
function send(event,data){for(const [win] of windows)if(!win.isDestroyed())win.webContents.send(event,data);}
function queueKey(){return `queue:${library.root}`;}
function playback(){return {currentId:sequence?.currentId??null,mode:player?.mode??'default',countdown,opening,source:sequence?.source??'folder'};}
function snapshot(){return {root:library.root,items:library.items(),browser:library.browser(),queue:sequence.clean(sequence.queue),upNext:sequence.upNext(),settings:preferences(),collapsed:store.get(`collapsed:${library.root}`,{}),playback:playback(),player:player.state,playerReady:fs.existsSync(player.executable)};}
function changed(){store.set(queueKey(),sequence.queue);send('library',snapshot());}
function resetSequence(){sequence=new Sequence({items:()=>library.items(),queue:store.get(queueKey(),[])});sequence.configure(preferences());}
function saveProgress(ended=false){if(sequence?.currentId)library.progressFor(sequence.currentId,player.state.position??0,player.state.duration??0,ended);}
function cancelCountdown(){clearInterval(countdownTimer);countdownTimer=null;countdown=null;send('playback',playback());}
function serial(work){const result=operations.then(work);operations=result.catch(()=>{});return result;}
function registerWindow(win,role){
  windows.set(win,role);win.on('closed',()=>windows.delete(win));win.setMenu(null);
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
  win.webContents.on('before-input-event',(event,input)=>{if(input.type==='keyDown'&&input.key==='Escape'&&player?.mode==='fullscreen'){event.preventDefault();player.setMode('default').catch(e=>send('failure',e.message));}});
}
async function nativeDialog(options){const old=player.hidden;player.hidden=true;player.layout();try{return await dialog.showOpenDialog(main,options);}finally{player.hidden=old;player.layout();}}
async function load(id,{advance=false,fromQueue=false,restart=false}={}){
  const item=store.item(id);if(!item||item.hidden||item.missing)throw new Error('Video is hidden or unavailable.');
  const file=await library.absolute(item);saveProgress();opening=true;send('playback',playback());
  try{
    await player.load(file,restart||item.watched?0:item.position);
    if(advance)sequence.consume(id);else sequence.start(id,fromQueue);
    const entries=await fsp.readdir(path.dirname(file),{withFileTypes:true});
    for(const entry of entries.filter(e=>e.isFile()&&/^subtitles(?:\.[a-z0-9_-]+)*\.(srt|ass|ssa|vtt)$/i.test(e.name)))await player.command(['sub-add',path.join(path.dirname(file),entry.name),'auto']).catch(()=>{});
    const prefs=preferences();await player.command(['set_property','volume',prefs.volume]);await player.command(['set_property','speed',prefs.speed]);
    if(player.mode==='default')await player.setMode('default');
  }finally{opening=false;changed();send('playback',playback());}
}
async function advance(automatic=false){
  cancelCountdown();if(automatic&&!preferences().autoplay)return;
  for(let attempt=0;attempt<library.items().length;attempt++){
    const id=sequence.next({automatic,autoplay:preferences().autoplay});if(!id){changed();return;}
    try{await load(id,{advance:true,restart:true});return;}catch(e){sequence.failed.add(id);sequence.remove(id);send('failure',`Skipped unavailable video: ${e.message}`);}
  }changed();
}
function ended(){
  if(opening||countdownTimer)return;saveProgress(true);changed();if(!preferences().autoplay)return;
  if(preferences().repeat==='one'){void serial(()=>advance(true)).catch(e=>send('failure',e.message));return;}
  countdown=8;send('playback',playback());
  countdownTimer=setInterval(()=>{countdown--;send('playback',playback());if(countdown<=0)void serial(()=>advance(true)).catch(e=>send('failure',e.message));},1000);
}
async function stop(){cancelCountdown();saveProgress();sequence.currentId=null;sequence.source='folder';sequence.cycle=[];sequence.deck=[];await player.stop();if(blocker!=null&&powerSaveBlocker.isStarted(blocker))powerSaveBlocker.stop(blocker);changed();}
async function action(method,...args){
  switch(method){
    case 'snapshot':return snapshot();
    case 'chooseRoot':{
      if(library.busy)throw new Error('Wait for the library operation to finish.');
      const result=await nativeDialog({title:'Choose your movie library',properties:['openDirectory']});
      if(!result.canceled){await serial(()=>stop());store.set('root',await fsp.realpath(result.filePaths[0]));await library.scan();resetSequence();}
      changed();return snapshot();
    }
    case 'browse':await library.browse(args[0]);changed();return snapshot();
    case 'chooseDestination':{
      const result=await nativeDialog({title:'Choose a folder inside your library',defaultPath:path.join(library.root,library.location),properties:['openDirectory','createDirectory']});
      if(result.canceled)return null;const relative=path.relative(library.root,result.filePaths[0]);await library.directory(relative);return relative;
    }
    case 'scan':await library.scan();sequence.queue=sequence.clean(sequence.queue);changed();return snapshot();
    case 'collapse':{
      const [section,value]=args;if(typeof section!=='string'||section.length>2048)throw new Error('Invalid section.');
      const collapsed=store.get(`collapsed:${library.root}`,{});collapsed[section]=Boolean(value);store.set(`collapsed:${library.root}`,collapsed);changed();return snapshot();
    }
    case 'pick':{
      const kind=args[0],filters={video:[{name:'Videos',extensions:[...VIDEO].map(e=>e.slice(1))}],cover:[{name:'Cover artwork',extensions:['jpg','jpeg','png','webp','bmp']}],subtitle:[{name:'Subtitles',extensions:['srt','ass','ssa','vtt']}]};
      if(!filters[kind])throw new Error('Unknown file type.');const result=await nativeDialog({properties:['openFile'],filters:filters[kind]});if(result.canceled)return null;
      const token=newId();selections.set(token,{file:result.filePaths[0],kind});if(kind==='subtitle')await player.command(['sub-add',result.filePaths[0],'select']);return {token,name:path.basename(result.filePaths[0])};
    }
    case 'importMovie':{
      const input=args[0],video=selections.get(input.videoToken),cover=selections.get(input.coverToken);
      if(video?.kind!=='video'||(input.coverToken&&cover?.kind!=='cover'))throw new Error('Select the local files again.');
      await library.importMovie({...input,video:video.file,cover:cover?.file});selections.delete(input.videoToken);selections.delete(input.coverToken);changed();return snapshot();
    }
    case 'cancelImport':library.importController?.abort();return;
    case 'edit':{
      if(args[0]===sequence.currentId)throw new Error('Stop this video before renaming it.');
      const changes={...args[1]};if(changes.coverToken){const cover=selections.get(changes.coverToken);if(cover?.kind!=='cover')throw new Error('Select the cover again.');changes.coverSource=cover.file;}
      await library.edit(args[0],changes);await library.scan();changed();return snapshot();
    }
    case 'hide':{
      const [id,value]=args;if(id===sequence.currentId&&value)await serial(()=>stop());library.hide(id,value);if(value)sequence.remove(id);changed();return snapshot();
    }
    case 'resetCover':library.resetCover(args[0]);changed();return snapshot();
    case 'markWatched':{
      const item=store.item(args[0]);if(!item||item.root!==library.root)throw new Error('Video not found.');store.save(item.root,{...item,watched:Boolean(args[1]),position:args[1]?item.position:0});changed();return snapshot();
    }
    case 'queue':{
      const [operation,value]=args;
      if(operation==='append')sequence.append(value);else if(operation==='remove')sequence.remove(value);else if(operation==='clear')sequence.clear();else if(operation==='reorder')sequence.reorder(value);else throw new Error('Unknown queue action.');changed();return snapshot();
    }
    case 'settings':{
      const input=args[0],prefs=preferences();
      if(input.theme!=null){if(!['auto','warm','cinema'].includes(input.theme))throw new Error('Invalid theme.');prefs.theme=input.theme;}
      if(input.textScale!=null){if(!Number.isInteger(input.textScale)||input.textScale<100||input.textScale>200||input.textScale%5)throw new Error('Text size must be 100–200%, in 5% steps.');prefs.textScale=input.textScale;}
      for(const key of ['cinemaStart','cinemaEnd'])if(input[key]!=null){if(!Number.isInteger(input[key])||input[key]<0||input[key]>23)throw new Error('Schedule hours must be 0–23.');prefs[key]=input[key];}
      for(const key of ['autoplay','shuffle'])if(input[key]!=null)prefs[key]=Boolean(input[key]);
      if(input.repeat!=null){if(!['off','one','all'].includes(input.repeat))throw new Error('Invalid repeat mode.');prefs.repeat=input.repeat;}
      for(const [key,min,max]of[['volume',0,100],['speed',.25,3]])if(input[key]!=null){if(!Number.isFinite(input[key])||input[key]<min||input[key]>max)throw new Error(`Invalid ${key}.`);prefs[key]=input[key];}
      store.set('preferences',prefs);sequence.configure(prefs);if(!prefs.autoplay)cancelCountdown();changed();return prefs;
    }
    case 'play':cancelCountdown();return serial(async()=>{sequence.failed.clear();await load(args[0]);return snapshot();});
    case 'playQueue':cancelCountdown();return serial(async()=>{sequence.failed.clear();const id=sequence.choose(sequence.queue);if(id)await load(id,{fromQueue:true});return snapshot();});
    case 'next':cancelCountdown();return serial(async()=>{await advance(false);return snapshot();});
    case 'cancelCountdown':cancelCountdown();return;
    case 'stop':return serial(async()=>{await stop();return snapshot();});
    case 'control':{
      const [name,value]=args;if(name==='pause'){cancelCountdown();return player.command(['cycle','pause']);}if(name==='mute')return player.command(['cycle','mute']);
      const controls={seek:['seek',value,'absolute+exact'],volume:['set_property','volume',value],speed:['set_property','speed',value],subtitle:['set_property','sid',value],audio:['set_property','aid',value],subtitleDelay:['set_property','sub-delay',value]};
      if(!controls[name])throw new Error('Unknown player control.');if(!(name==='subtitle'&&value==='no')&&!Number.isFinite(value))throw new Error('Invalid control value.');
      if((name==='volume'&&(value<0||value>100))||(name==='speed'&&(value<.25||value>3))||(name==='seek'&&value<0))throw new Error('Control value out of range.');
      if(name==='seek')cancelCountdown();await player.command(controls[name]);if(name==='speed'||name==='volume'){store.set('preferences',{...preferences(),[name]:value});changed();}return;
    }
    case 'viewport':{
      if(player.mode!=='default')return;const r=args[0];if(!r){player.viewport(null);return;}
      if(!['x','y','width','height'].every(k=>Number.isFinite(r[k]))||r.width<1||r.height<1)return;
      const b=main.getContentBounds();if(r.x<0||r.y<0||r.x+r.width>b.width+1||r.y+r.height>b.height+1){player.viewport(null);return;}player.viewport(r);return;
    }
    case 'obscure':player.hidden=Boolean(args[0])&&player.mode!=='mini';player.layout();return;
    case 'mode':await player.setMode(args[0]);changed();return snapshot();
    case 'pinControls':player.pinned=Boolean(args[0]);player.checkHover();return;
    case 'resizeMini':{
      if(player.mode!=='mini')return;const {width,height}=args[0];if(!Number.isFinite(width)||!Number.isFinite(height))return;
      const area=screen.getDisplayMatching(player.window.getBounds()).workArea;player.window.setSize(Math.round(Math.min(area.width,Math.max(320,width))),Math.round(Math.min(area.height,Math.max(180,height))));return;
    }
    case 'window':if(args[0]==='minimize')main.minimize();else if(args[0]==='maximize')main.isMaximized()?main.unmaximize():main.maximize();else if(args[0]==='close')main.close();return;
    default:throw new Error('Unknown app action.');
  }
}
app.on('second-instance',()=>{if(main){main.restore();main.show();main.focus();}});
app.whenReady().then(async()=>{
  if(!smoke&&!testSession)await migrateProfile(path.join(app.getPath('appData'),'matinee'),profile);
  store=new Store(profile);library=new Library(store,data=>send('progress',data));resetSequence();
  main=new BrowserWindow({width:1440,height:960,minWidth:960,minHeight:640,frame:false,show:false,backgroundColor:'#f4f0e8',title:'Astra',icon:path.resolve(__dirname,'../assets/astra.ico'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
  registerWindow(main,'main');
  player=new Player(main,app.isPackaged?path.join(process.resourcesPath,'mpv','mpv.exe'):path.resolve(__dirname,'../vendor/mpv/mpv.exe'),{registerWindow,miniBounds:store.get('miniBounds',null)});
  protocol.handle('art',async request=>{try{
    const item=store.item(new URL(request.url).hostname);if(!item||item.root!==library.root||!item.cover||item.hidden)return new Response('',{status:404});
    const absolute=await fsp.realpath(path.resolve(library.root,item.cover));if(!within(await fsp.realpath(library.root),absolute))return new Response('',{status:403});return net.fetch(pathToFileURL(absolute).toString());
  }catch{return new Response('',{status:404});}});
  const controlActions=new Set(['snapshot','control','next','stop','mode','pinControls','resizeMini','cancelCountdown','settings','pick']);
  ipcMain.handle('astra',async(event,method,...args)=>{
    const win=BrowserWindow.fromWebContents(event.sender),role=windows.get(win);
    if(!role||event.senderFrame!==event.sender.mainFrame||(role==='controls'&&!controlActions.has(method)))throw new Error('Untrusted request.');
    if(role==='controls'&&method==='pick'&&args[0]!=='subtitle')throw new Error('Unsupported file picker.');
    try{return await action(method,...args);}catch(e){throw new Error(e.message);}
  });
  main.webContents.session.setPermissionRequestHandler((_,__,callback)=>callback(false));
  main.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(_,callback)=>callback({cancel:true}));
  player.on('state',state=>{send('player',state);if(!state.paused&&sequence.currentId&&(blocker==null||!powerSaveBlocker.isStarted(blocker)))blocker=powerSaveBlocker.start('prevent-display-sleep');else if(state.paused&&blocker!=null&&powerSaveBlocker.isStarted(blocker))powerSaveBlocker.stop(blocker);});
  player.on('ended',ended);player.on('failure',error=>{cancelCountdown();send('failure',error);});
  player.on('mode',()=>send('playback',playback()));player.on('mini-bounds',bounds=>store.set('miniBounds',bounds));
  screen.on('display-removed',()=>{if(player.mode==='mini')void player.setMode('mini');});
  main.on('close',()=>{cancelCountdown();saveProgress();clearInterval(progressTimer);player.destroy();});
  await main.loadFile(path.resolve(__dirname,'../dist/index.html'));if(!smoke&&!testSession)main.show();
  progressTimer=setInterval(()=>{if(!opening)saveProgress();},5000);
  if(library.root&&!smoke)library.scan().then(()=>changed()).catch(e=>send('failure',e.message));
  if(smoke){try{
    await new Promise(r=>setTimeout(r,700));const content=await main.webContents.executeJavaScript('document.body.innerText');if(!content.includes('Astra'))throw new Error('Renderer did not mount.');await fsp.mkdir(path.resolve('.test-output'),{recursive:true});
    if(process.env.ASTRA_SMOKE_MEDIA){await player.load(process.env.ASTRA_SMOKE_MEDIA);await new Promise(r=>setTimeout(r,1000));const duration=await player.command(['get_property','duration']);await player.command(['set_property','pause',true]);await player.command(['seek',1,'absolute']);await player.command(['set_property','speed',1.5]);await player.command(['screenshot-to-file',path.resolve('.test-output/decoded-frame.png'),'video']);if(!(duration>0))throw new Error('No duration');console.log(`Native playback passed: duration=${duration}, pause/seek/speed accepted.`);}
    await fsp.writeFile(path.resolve('.test-output/desktop.png'),(await main.webContents.capturePage()).toPNG());console.log('Astra packaged smoke passed.');main.close();app.exit(0);
  }catch(e){console.error(e);player.destroy();app.exit(1);}}
}).catch(error=>{console.error(error);dialog.showErrorBox('Astra could not start',error.message);app.exit(1);});
app.on('window-all-closed',()=>app.quit());
