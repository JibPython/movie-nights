const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Store } = require('../desktop/store.cjs');
const { Library } = require('../desktop/library.cjs');
const { validName, within, episodeInfo, compareEpisodes, cinemaAt, recommendations } = require('../desktop/core.cjs');
async function fixture(t) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(),'matinee-test-'));
  const root = path.join(temp,'Movies'); await fs.mkdir(root);
  const store = new Store(path.join(temp,'profile')); store.set('root',root);
  const library = new Library(store);
  t.after(async()=>{store.close(); await fs.rm(temp,{recursive:true,force:true});});
  return {temp,root,store,library};
}
test('Cinema schedule handles midnight, exact boundaries and daytime schedules',()=>{
  assert.equal(cinemaAt(18),false); assert.equal(cinemaAt(19),true); assert.equal(cinemaAt(0),true); assert.equal(cinemaAt(6),true); assert.equal(cinemaAt(7),false);
  assert.equal(cinemaAt(12,10,15),true); assert.equal(cinemaAt(16,10,15),false);
});
test('Windows names and path containment reject destructive paths',()=>{
  for(const name of ['../movie','CON','NUL.mp4','LPT1','bad:name','ends.',''])assert.throws(()=>validName(name));
  assert.equal(validName('My Movie (2024)'),'My Movie (2024)');
  assert.equal(within('C:\\Movies','C:\\Movies\\Horror\\film.mp4'),true);
  assert.equal(within('C:\\Movies','C:\\Movies-elsewhere\\film.mp4'),false);
});
test('Episodes sort numerically and custom order overrides season order',()=>{
  assert.deepEqual(episodeInfo('Show.S01E10.mkv'),{season:1,episode:10});
  const episodes=[{title:'Ten',season:1,episode:10},{title:'Two',season:1,episode:2}];
  assert.equal(episodes.sort(compareEpisodes)[0].title,'Two');
  assert.equal([...episodes,{title:'Special',season:0,episode:1,order:0}].sort(compareEpisodes)[0].title,'Special');
});
test('Recommendations prioritise next episode and exclude missing titles',()=>{
  const current={id:'1',series:'A',season:1,episode:1,title:'One',genre:'Drama'};
  const next={...current,id:'2',episode:2,title:'Two'};
  const items=[current,{...current,id:'3',episode:10,title:'Ten'},next,{id:'4',title:'Missing',genre:'Drama',missing:true},{id:'5',title:'Movie',genre:'Drama'}];
  const results=recommendations(items,current,true,()=>.5);
  assert.equal(results[0].id,'2');assert.equal(results.some(i=>i.id==='4'),false);assert.equal(results.some(i=>i.id==='1'),false);
});
test('Import copies media, keeps the source, and detects duplicate folders',async t=>{
  const {temp,library}=await fixture(t);const video=path.join(temp,'source.mp4');await fs.writeFile(video,'movie-data');
  const items=await library.importMovie({title:'Example',genre:'Drama',video});
  assert.equal(items.length,1);assert.equal(await fs.readFile(video,'utf8'),'movie-data');assert.match(items[0].file,/Example/);
  await assert.rejects(library.importMovie({title:'Example',genre:'Drama',video}),/already/);
});
test('Renaming preserves progress and stable ID through a rescan',async t=>{
  const {temp,library,store}=await fixture(t);const video=path.join(temp,'source.mkv');await fs.writeFile(video,'movie-data');
  const [item]=await library.importMovie({title:'Original',genre:'Horror',video});library.progressFor(item.id,45,200);
  await library.edit(item.id,{title:'Display title',filename:'Renamed file',genre:'Horror',series:''});
  const [rescanned]=await library.scan();assert.equal(rescanned.id,item.id);assert.equal(rescanned.position,45);assert.equal(rescanned.title,'Display title');assert.match(rescanned.file,/Renamed file\.mkv$/);
  assert.equal(store.item(item.id).duration,200);
});
test('Filename collisions never overwrite existing media',async t=>{
  const {temp,root,library}=await fixture(t);const video=path.join(temp,'source.mp4');await fs.writeFile(video,'original');
  const [item]=await library.importMovie({title:'Original',genre:'Drama',video});const sibling=path.join(root,path.dirname(item.file),'Taken.mp4');await fs.writeFile(sibling,'keep-me');
  await assert.rejects(library.edit(item.id,{title:'New',filename:'Taken',genre:'Drama'}),/already exists/);
  assert.equal(await fs.readFile(sibling,'utf8'),'keep-me');assert.equal(library.items()[0].title,'Original');
});
test('Missing files retain state and an unavailable root leaves the index intact',async t=>{
  const {temp,root,library,store}=await fixture(t);const video=path.join(temp,'source.mp4');await fs.writeFile(video,'x');
  const [item]=await library.importMovie({title:'A',genre:'Drama',video});library.progressFor(item.id,12,100);
  await fs.unlink(path.join(root,item.file));const [missing]=await library.scan();assert.equal(missing.missing,true);assert.equal(missing.position,12);
  await fs.rename(root,`${root}-offline`);await assert.rejects(library.scan());assert.equal(store.item(item.id).position,12);
});
test('Cancelled copy never publishes partial media and leaves original intact',async t=>{
  const {temp,root,library}=await fixture(t);const video=path.join(temp,'source.mp4');await fs.writeFile(video,Buffer.alloc(1024*1024));
  library.progress=()=>library.importController?.abort();
  await assert.rejects(library.importMovie({title:'Cancelled',genre:'Drama',video}));
  assert.equal((await fs.readdir(root)).length,0);assert.equal((await fs.stat(video)).size,1024*1024);
});
test('Folder rename and artwork replacement preserve IDs and sibling files',async t=>{
  const {temp,root,library}=await fixture(t);const video=path.join(temp,'source.mp4');await fs.writeFile(video,'video');
  const cover=path.join(temp,'art.png');await fs.writeFile(cover,'artwork');
  const [item]=await library.importMovie({title:'Old',genre:'Drama',video});
  const originalDirectory=path.join(root,path.dirname(item.file));await fs.writeFile(path.join(originalDirectory,'subtitles.en.srt'),'captions');
  library.progressFor(item.id,20,100);
  await library.edit(item.id,{title:'New',filename:'New',foldername:'New folder',genre:'Drama',coverSource:cover});
  const [updated]=await library.scan();assert.equal(updated.id,item.id);assert.equal(updated.position,20);assert.match(updated.file,/New folder/);assert.match(updated.cover,/New folder/);
  assert.equal(await fs.readFile(path.join(root,path.dirname(updated.file),'subtitles.en.srt'),'utf8'),'captions');
});
