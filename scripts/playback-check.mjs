import {_electron as electron} from 'playwright';
import path from 'node:path';
import fs from 'node:fs/promises';
import net from 'node:net';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {Store}=require('../desktop/store.cjs'),{Library}=require('../desktop/library.cjs');
const project=path.resolve(import.meta.dirname,'..');
const packaged=process.argv.includes('--packaged');
const compatibility=process.argv.includes('--compatibility');
const output=path.join(project,'.test-output',`${packaged?'packaged':'source'}-playback${compatibility?'-compatibility':''}`);
const root=path.join(output,'media'),profile=path.join(output,'.test-output','astra-integration-profile');
if(packaged){
  for(const file of ['mpv.exe','mpv.com','d3dcompiler_43.dll','LICENSE.GPL','LICENSE.LGPL','BUILD-SOURCE.json']){
    const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
    assert.equal(hash(await fs.readFile(path.join(project,'release','win-unpacked','resources','mpv',file))),hash(await fs.readFile(path.join(project,'vendor','mpv',file))),`Packaged player file differs: ${file}`);
  }
  await fs.access(path.join(project,'release','win-unpacked','resources','THIRD_PARTY_NOTICES.md'));
}
await fs.mkdir(root,{recursive:true});
await fs.copyFile(path.join(project,'.test-output','fixture-av.mp4'),path.join(root,'Moving picture with sound.mp4'));
await fs.copyFile(path.join(project,'.test-output','fixture-av.mp4'),path.join(root,'Next picture.mp4'));
await fs.writeFile(path.join(root,'Broken picture.mp4'),'Deliberately invalid video for error recovery testing.');
const store=new Store(profile);
store.set('root',root);store.set('preferences',{theme:'warm',autoplay:false,textScale:125,volume:50,speed:1,playbackCompatibility:compatibility});
store.set(`queue:${root}`,[]);store.set(`location:${root}`,'');
const library=new Library(store);await library.scan();
for(const item of library.items())store.save(root,{...item,hidden:false,position:0,duration:0,watched:false});
store.close();
for(const name of ['playback.log','playback.previous.log'])await fs.rm(path.join(profile,'logs',name),{force:true});
const app=await electron.launch({
  ...(packaged?{executablePath:path.join(project,'release','win-unpacked','Astra.exe')}:{}),
  args:[...(packaged?[]:[project]),'--test-session'],cwd:output,
  env:{...process.env,ELECTRON_RUN_AS_NODE:undefined},timeout:30000,
});
let socket;
try{
  const page=await app.firstWindow();
  const identity=await app.evaluate(({app})=>({version:app.getVersion(),packaged:app.isPackaged}));
  assert.equal(identity.version,JSON.parse(await fs.readFile(path.join(project,'package.json'),'utf8')).version);
  assert.equal(identity.packaged,packaged);
  const waitFor=async(predicate,message)=>{
    const deadline=Date.now()+30000;
    while(!await predicate()){
      if(Date.now()>deadline)throw new Error(`${message}: ${await page.locator('body').innerText()}`);
      await page.waitForTimeout(100);
    }
  };
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.show();w.focus();});
  await page.getByRole('button',{name:'Play Moving picture with sound',exact:true}).first().click();
  await waitFor(async()=>Boolean((await page.evaluate(()=>window.astra.snapshot())).playback.currentId),'Playback did not open');
  const pid=await app.evaluate(()=>process.pid);
  const pipes=await fs.readdir('\\\\.\\pipe\\');
  const pipe=pipes.find(name=>name.startsWith(`astra-${pid}-`));
  assert.ok(pipe,'mpv IPC pipe exists');
  socket=net.createConnection(`\\\\.\\pipe\\${pipe}`);
  await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);});
  let sequence=0,buffer='';const pending=new Map();
  socket.on('data',chunk=>{buffer+=chunk.toString();let end;while((end=buffer.indexOf('\n'))>=0){const m=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);const p=pending.get(m.request_id);if(p){pending.delete(m.request_id);clearTimeout(p.timer);m.error==='success'?p.resolve(m.data):p.reject(new Error(m.error));}}});
  const command=command=>new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Test IPC timeout'));},8000);pending.set(id,{resolve,reject,timer});socket.write(`${JSON.stringify({command,request_id:id})}\n`);});
  const properties=['time-pos','pause','duration','current-vo','current-ao','video-params','audio-params','vid','aid','mute','volume','idle-active','eof-reached','hwdec-current'];
  const report={packaged,compatibility,properties:{}};
  for(const prop of properties)report.properties[prop]=await command(['get_property',prop]).catch(e=>({error:e.message}));
  await page.locator('.astra-video-frame').waitFor({state:'visible'});
  const before=await command(['get_property','time-pos']);
  await page.waitForTimeout(600);
  const after=await command(['get_property','time-pos']);
  report.windows=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().map(w=>({url:w.webContents.getURL(),visible:w.isVisible(),bounds:w.getBounds(),parent:w.getParentWindow()?.id})));
  report.progress={before,after};
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
  assert.ok(after>before+.2,`Playback must advance without seeking: ${before} -> ${after}`);
  assert.ok(report.properties['current-vo']&&typeof report.properties['current-vo']==='string');
  assert.ok(report.properties['current-ao']&&typeof report.properties['current-ao']==='string');
  assert.notEqual(report.properties['current-ao'],'null','Real audio output is required');
  assert.notEqual(report.properties['current-vo'],'null','Real video output is required');
  if(compatibility){assert.equal(report.properties['hwdec-current'],'no');assert.ok(['gpu','direct3d'].includes(report.properties['current-vo']));}
  assert.ok(report.windows.find(w=>w.url==='')?.visible,'Native video window must be visible');
  await command(['screenshot-to-file',path.join(output,'decoded-frame.png'),'video']);
  const assertVisible=async name=>{
    const geometry=await app.evaluate(({BrowserWindow,screen})=>{
      const windows=BrowserWindow.getAllWindows();
      const video=windows.find(w=>w.webContents.getURL()==='');
      const main=windows.find(w=>w.webContents.getURL().endsWith('index.html'));
      return {visible:video.isVisible(),video:video.getBounds(),main:main.getContentBounds(),area:screen.getDisplayMatching(video.getBounds()).workArea};
    });
    assert.ok(geometry.visible,`${name}: native window must be visible`);
    const mode=(await page.evaluate(()=>window.astra.snapshot())).playback.mode;
    if(mode==='mini'){
      const {video,area}=geometry;
      assert.ok(video.x>=area.x&&video.y>=area.y&&video.x+video.width<=area.x+area.width+1&&video.y+video.height<=area.y+area.height+1,'Mini-player must stay within the display work area');
    }else{
      const rect=mode==='fullscreen'?{x:0,y:0,width:geometry.main.width,height:geometry.main.height}:await page.locator('.astra-video-frame').boundingBox();
      const expected={x:Math.round(geometry.main.x+rect.x),y:Math.round(geometry.main.y+rect.y),width:Math.round(rect.width),height:Math.round(rect.height)};
      for(const key of ['x','y','width','height'])assert.ok(Math.abs(geometry.video[key]-expected[key])<=1,`${name}: native ${key} must match the video viewport`);
    }
  };
  await assertVisible('default');
  await page.waitForTimeout(350);
  await command(['screenshot-to-file',path.join(output,'decoded-frame-later.png'),'video']);
  assert.notDeepEqual(await fs.readFile(path.join(output,'decoded-frame.png')),await fs.readFile(path.join(output,'decoded-frame-later.png')),'Decoded frames must change while playing');
  await page.evaluate(()=>window.astra.mode('fullscreen'));
  await page.waitForTimeout(400);
  await assertVisible('fullscreen');
  await page.evaluate(()=>window.astra.mode('mini'));
  await page.waitForTimeout(400);
  await assertVisible('mini');
  await page.evaluate(()=>window.astra.mode('default'));
  await page.waitForTimeout(400);
  await assertVisible('restored');
  await command(['set_property','pause',true]);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('index.html')).setSize(960,640));
  for(const textScale of [100,125,150,175,200]){
    await page.evaluate(textScale=>window.astra.settings({textScale}),textScale);
    await page.waitForTimeout(200);
    await assertVisible(`small-window-${textScale}`);
  }
  const initial=await page.evaluate(()=>window.astra.snapshot());
  const id=initial.items.find(i=>i.title==='Moving picture with sound').id;
  const brokenId=initial.items.find(i=>i.title==='Broken picture').id;
  const nextId=initial.items.find(i=>i.title==='Next picture').id;
  // Terminate only this test app's player, then verify it can start a new session.
  const closed=new Promise(resolve=>socket.once('close',resolve));
  socket.write(`${JSON.stringify({command:['quit']})}\n`);await closed;
  await waitFor(async()=>!(await page.evaluate(()=>window.astra.snapshot())).playback.currentId,'Engine exit did not clear playback');
  let state=await page.evaluate(()=>window.astra.snapshot());
  assert.equal(state.player.paused,true);assert.equal(state.player.loading,false);
  await page.evaluate(id=>window.astra.play(id),id);
  await waitFor(async()=>(await page.evaluate(()=>window.astra.snapshot())).player.position>.2,'Playback did not recover after engine exit');
  await page.evaluate(()=>window.astra.stop());
  await assert.rejects(page.evaluate(id=>window.astra.play(id),brokenId));
  state=await page.evaluate(()=>window.astra.snapshot());
  assert.equal(state.playback.currentId,null);assert.equal(state.playback.opening,false);assert.equal(state.player.loading,false);
  await page.evaluate(id=>window.astra.play(id),id);
  await page.evaluate(async({brokenId,nextId})=>{await window.astra.queue('append',brokenId);await window.astra.queue('append',nextId);await window.astra.next();},{brokenId,nextId});
  state=await page.evaluate(()=>window.astra.snapshot());
  assert.equal(state.playback.currentId,nextId,'Queue must skip broken media and continue');assert.deepEqual(state.queue,[]);
  assert.equal(state.player.paused,false,'Reusing an unpaused engine must not leave the UI paused');
  assert.ok(state.items.find(i=>i.id===id).position>.1,'Skipping corrupt media must preserve the previous video resume position');
  await page.evaluate(()=>window.astra.mode('mini'));
  await page.evaluate(compatibility=>window.astra.settings({playbackCompatibility:!compatibility}),compatibility);
  await page.evaluate(id=>window.astra.play(id),id);
  await waitFor(async()=>(await page.evaluate(()=>window.astra.snapshot())).player.position>.2,'Switching playback compatibility did not recover');
  state=await page.evaluate(()=>window.astra.snapshot());assert.equal(state.playback.mode,'mini');
  assert.equal(state.player.volume,50);assert.equal(state.player.speed,1);
  await page.waitForTimeout(600);
  assert.ok((await page.evaluate(()=>window.astra.snapshot())).player.position>state.player.position+.2,'Recreated mini-player must advance');
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL()==='').getParentWindow()===null),true,'Recreated mini-player must remain independent');
  await page.evaluate(id=>window.astra.play(id),nextId);
  await page.evaluate(async id=>{await window.astra.queue('append',id);await window.astra.next();},brokenId);
  state=await page.evaluate(()=>window.astra.snapshot());
  assert.equal(state.playback.currentId,null,'Exhausting failed candidates must end playback');
  assert.equal(state.player.paused,true);assert.equal(state.player.duration,0);
  const log=await fs.readFile(path.join(profile,'logs','playback.log'),'utf8');
  for(const event of ['app-start','engine-start','output','video-window','engine-exit','load-failed'])assert.ok(log.includes(event),`Missing diagnostic: ${event}`);
  console.log(`${packaged?'Packaged':'Source'} playback (${compatibility?'compatibility':'normal'}) passed: clock advancement, changing decoded frames, real audio/video outputs, native visibility/modes/text scaling, crash recovery, corrupt-file recovery and queue skipping. On-screen picture and audible sound still require a human check.`);
}finally{socket?.destroy();await app.close();}
