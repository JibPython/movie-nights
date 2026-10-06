import { _electron as electron } from 'playwright';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const {Store}=require('../desktop/store.cjs');
const {Library}=require('../desktop/library.cjs');
const output=path.resolve('.test-output');
const root=path.join(output,'integration-library');
await fs.mkdir(root,{recursive:true});
const store=new Store(path.join(output,'integration-profile'));
store.set('root',root);store.set('preferences',{theme:'warm',autoplay:false});
const library=new Library(store);
await library.scan();
if (!library.items().length) {
  for (const [title,genre,series,episode] of [['A Quiet Afternoon','Drama','',null],['After the Rain','Drama','',null],['Into the Pines','Adventure','',null],['The Long Way Home','Adventure','',null],['The First Chapter','Drama','Sunday Stories',1],['The Second Chapter','Drama','Sunday Stories',2]]) {
    await library.importMovie({title,genre,series,season:1,episode,video:path.join(output,'fixture.avi')});
  }
}
for (const item of library.items()) store.save(root,{...item,position:0,duration:0,watched:false,lastWatched:null});
store.set(`queue:${root}`,[]);store.close();
const app=await electron.launch({args:['.','--test-session'],cwd:path.resolve('.'),env:{...process.env,ELECTRON_RUN_AS_NODE:undefined},timeout:30000});
let errors=[];
try {
  const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
  await page.getByRole('heading',{name:'Good films.'}).waitFor();
  await page.getByRole('button',{name:'Play A Quiet Afternoon',exact:true}).first().waitFor();
  await page.screenshot({path:path.join(output,'library-warm.png')});
  await page.getByRole('button',{name:'Switch to cinema theme'}).click();
  await page.screenshot({path:path.join(output,'library-cinema.png')});
  await page.getByRole('button',{name:'Queue After the Rain',exact:true}).first().click();
  await page.getByRole('button',{name:/^Queue 1$/}).click();
  await page.getByRole('button',{name:'After the Rain Drama',exact:true}).waitFor();
  await page.getByRole('button',{name:'Home',exact:true}).click();
  await page.getByRole('button',{name:'Play A Quiet Afternoon',exact:true}).first().click();
  await page.getByRole('heading',{name:'A Quiet Afternoon',exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('.play-time')?.textContent?.includes('0:05'));
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  await page.getByRole('button',{name:'Play',exact:true}).waitFor();
  await page.getByRole('combobox',{name:'Playback speed'}).selectOption('1.5');
  await page.getByRole('slider',{name:'Playback position'}).fill('1');
  await page.screenshot({path:path.join(output,'watch-page.png')});
  await page.getByRole('button',{name:'Fullscreen',exact:true}).click();
  await page.getByRole('button',{name:'Exit fullscreen',exact:true}).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Fullscreen',exact:true}).waitFor();
  await page.getByRole('checkbox',{name:'Autoplay'}).check();
  await page.getByRole('slider',{name:'Playback position'}).fill('4.8');
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await page.getByRole('button',{name:'Play now',exact:true}).waitFor();
  await page.getByRole('button',{name:'Play now',exact:true}).click();
  await page.getByRole('heading',{name:'After the Rain',exact:true}).waitFor();
  await page.getByRole('button',{name:'Back to your collection'}).click();
  await page.getByRole('button',{name:'Edit A Quiet Afternoon',exact:true}).first().click();
  await page.getByRole('dialog').waitFor();
  await page.getByLabel('Display title').fill('A Quiet Afternoon');
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Settings & preferences'}).click();
  await page.getByRole('button',{name:'Follow the day'}).click();
  await page.getByRole('button',{name:'Close dialog'}).click();
  const snapshot=await page.evaluate(()=>window.matinee.snapshot());
  assert.equal(snapshot.settings.theme,'auto');assert.equal(snapshot.items.length,6);assert.ok(snapshot.items.some(i=>i.position>=.5));
  assert.deepEqual(errors,[]);
  console.log('Integration passed: real library, both themes, queue, native playback, pause, seek, speed, fullscreen, metadata, preferences, persistence.');
} finally { await app.close(); }
