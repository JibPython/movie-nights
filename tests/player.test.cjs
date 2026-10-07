const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {EventEmitter}=require('node:events');
const {PlaybackLog}=require('../desktop/playback-log.cjs');

function harness({overlayError=false,spawnError=false}={}) {
  const children=[],intervals=[];
  class Window extends EventEmitter {
    constructor(){super();this.visible=false;this.destroyed=false;this.bounds={x:0,y:0,width:800,height:600};}
    setIgnoreMouseEvents(){} getNativeWindowHandle(){return Buffer.alloc(8,1);}
    async loadFile(){if(overlayError)throw new Error('Controls failed to load');}
    isDestroyed(){return this.destroyed;} destroy(){this.destroyed=true;this.visible=false;}
    isVisible(){return this.visible;} isMinimized(){return false;}
    getBounds(){return this.bounds;} getContentBounds(){return this.bounds;}
    setBounds(bounds){this.bounds=bounds;} hide(){this.visible=false;} showInactive(){this.visible=true;}
  }
  const fakeSpawn=()=>{
    const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();
    child.kill=()=>{child.killed=true;};children.push(child);
    if(spawnError)queueMicrotask(()=>child.emit('error',new Error('spawn ENOENT')));
    return child;
  };
  const net={createConnection(){const socket=new EventEmitter();socket.destroyed=false;socket.destroy=()=>{socket.destroyed=true;socket.emit('close');};queueMicrotask(()=>spawnError?socket.emit('error',new Error('No pipe')):socket.emit('connect'));return socket;}};
  const module={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../desktop/player.cjs'),'utf8'),{
    module,__dirname:path.join(__dirname,'../desktop'),Buffer,process,setTimeout,clearTimeout,clearInterval,
    setInterval:(callback,delay)=>{intervals.push(callback);return setInterval(callback,delay);},
    require:name=>name==='electron'?{BrowserWindow:Window,screen:{getCursorScreenPoint:()=>({x:0,y:0})}}:name==='node:child_process'?{spawn:fakeSpawn}:name==='node:net'?net:require(name),
  });
  const parent=new Window();parent.visible=true;
  const player=new module.exports.Player(parent,'test-mpv.exe');
  player.command=async()=>{};
  return {player,children,intervals};
}

test('Missing bundled player reports an actionable error and leaves no native windows',async()=>{
  const {player}=harness({spawnError:true});
  await assert.rejects(player.start(),/ENOENT.*reinstall Astra/);
  assert.equal(player.window,null);assert.equal(player.socket,null);
});

test('Stalled playback reports a failure, but intentional pause and end-of-file do not',async t=>{
  const {player,intervals}=harness();t.after(()=>player.destroy());player.start=async()=>{};
  player.command=async args=>{if(args[0]==='loadfile')queueMicrotask(()=>player.message({event:'file-loaded'}));};
  await player.load('fixture.mp4');let failures=0;player.on('failure',()=>failures++);
  const tick=intervals.at(-1);
  player.lastAdvance=Date.now()-20000;player.state.paused=true;tick();assert.equal(failures,0);
  player.lastAdvance=Date.now()-20000;player.state.paused=false;player.ended=true;tick();assert.equal(failures,0);
  player.lastAdvance=Date.now()-20000;player.ended=false;tick();assert.equal(failures,1);
  assert.equal(player.state.paused,true);
});

test('A late exit from an old player cannot destroy the replacement player',async t=>{
  const {player,children}=harness();t.after(()=>player.destroy());
  await player.start();const old=children[0];player.destroy();
  await player.start();const window=player.window,socket=player.socket;
  old.emit('exit',0);
  assert.equal(player.window,window);assert.equal(window.isDestroyed(),false);
  assert.equal(player.socket,socket);assert.equal(socket.destroyed,false);
  assert.equal(player.process,children[1]);
});

test('Unexpected engine exit clears loading, pauses state and releases native windows',async t=>{
  const {player,children}=harness();t.after(()=>player.destroy());
  await player.start();player.state.loading=true;player.state.paused=false;
  let failure;player.on('failure',message=>{failure=message;});children[0].emit('exit',1);
  assert.equal(player.state.loading,false);assert.equal(player.state.paused,true);
  assert.equal(player.window,null);assert.equal(player.socket,null);
  assert.match(failure,/Compatibility playback/);
});

test('Controls initialization failure cleans up both native windows',async()=>{
  const {player}=harness({overlayError:true});
  await assert.rejects(player.start(),/Controls failed to load/);
  assert.equal(player.window,null);assert.equal(player.overlay,null);assert.equal(player.starting,null);
});

test('A failed file load clears stale duration, tracks, loading state and event listeners',async t=>{
  const {player}=harness();t.after(()=>player.destroy());player.start=async()=>{};
  player.command=async args=>{if(args[0]==='loadfile')queueMicrotask(()=>player.message({event:'end-file',reason:'error',file_error:'Invalid video'}));};
  player.state.duration=50;player.state.tracks=[{id:1,type:'video'}];
  await assert.rejects(player.load('broken.mp4'),/Invalid video/);
  assert.equal(player.state.duration,0);assert.equal(player.state.tracks.length,0);
  assert.equal(player.state.loading,false);assert.equal(player.state.paused,true);
  assert.equal(player.listenerCount('loaded'),0);assert.equal(player.listenerCount('failure'),0);
});

test('Fullscreen visibility does not depend on a normal-mode viewport',async t=>{
  const {player}=harness();t.after(()=>player.destroy());await player.start();
  player.mode='fullscreen';player.rect=null;player.layout();
  assert.equal(player.window.isVisible(),true);
  player.mode='default';player.layout();assert.equal(player.window.isVisible(),false);
});

test('Playback logs rotate within a fixed disk budget and tolerate write errors',t=>{
  const output=path.resolve('.test-output');fs.mkdirSync(output,{recursive:true});
  const directory=fs.mkdtempSync(path.join(output,'playback-log-test-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const log=new PlaybackLog(directory,8192);
  for(let n=0;n<100;n++)log.write('test',{n,text:'x'.repeat(500)});
  assert.ok(fs.statSync(log.file).size<=8192);assert.ok(fs.statSync(log.previous).size<=8192);
  assert.ok(fs.readFileSync(log.file,'utf8').includes('"n":99'));
  log.write('large-unicode',{text:'\u{1f3ac}'.repeat(10000)});assert.ok(fs.statSync(log.file).size<=8192);
  const blocked=path.join(directory,'file');fs.writeFileSync(blocked,'not a directory');
  assert.doesNotThrow(()=>new PlaybackLog(blocked).write('test'));
});
