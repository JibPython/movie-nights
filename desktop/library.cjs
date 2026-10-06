const fs = require('node:fs/promises');
const { createReadStream, createWriteStream } = require('node:fs');
const { pipeline } = require('node:stream/promises');
const path = require('node:path');
const { VIDEO, IMAGE, validName, within, episodeInfo, newId, byName } = require('./core.cjs');
async function readJson(file) { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return {}; throw new Error(`Cannot read metadata: ${file}`); } }
async function atomicJson(file, data) {
  const temp = `${file}.${newId()}.tmp`;
  try { await fs.writeFile(temp, JSON.stringify(data, null, 2), { flag: 'wx' }); await fs.rename(temp, file); }
  finally { await fs.rm(temp, { force: true }); }
}
async function exists(file) { try { await fs.access(file); return true; } catch { return false; } }
class Library {
  constructor(store, progress = () => {}) { this.store = store; this.progress = progress; this.busy = false; this.importController = null; }
  get root() { return this.store.get('root', ''); }
  items() { return this.root ? this.store.items(this.root) : []; }
  get location() { return this.store.get(`location:${this.root}`, ''); }
  async directory(relative = '') {
    if (!this.root || typeof relative !== 'string' || path.isAbsolute(relative)) throw new Error('Choose a folder inside your library.');
    const absolute = path.resolve(this.root, relative);
    if (!within(this.root,absolute)) throw new Error('Folder is outside the library.');
    const real = await fs.realpath(absolute);
    if (!within(await fs.realpath(this.root),real) || !(await fs.stat(real)).isDirectory()) throw new Error('Folder is outside the library.');
    return real;
  }
  async browse(relative) { const dir=await this.directory(relative); this.store.set(`location:${this.root}`,path.relative(this.root,dir)); return this.browser(); }
  browser() {
    const current=this.location;
    const dirs=this.store.get(`directories:${this.root}`,[]);
    return { path:current, folders:dirs.filter(d=>path.dirname(d.path)===(current||'.')).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'})), videoIds:this.items().filter(i=>!i.hidden&&path.dirname(i.file)===(current||'.')).sort(byName).map(i=>i.id) };
  }
  hide(id, hidden) {
    const item=this.store.item(id);if(!item||item.root!==this.root)throw new Error('Video not found.');
    this.store.save(this.root,{...item,hidden:Boolean(hidden)});
  }
  resetCover(id) {
    const item=this.store.item(id);if(!item||item.root!==this.root)throw new Error('Video not found.');
    this.store.save(this.root,{...item,cover:'',coverMode:'default'});
  }
  async absolute(item) {
    if (!item || item.root !== this.root) throw new Error('This title is not in the active library.');
    const target = path.resolve(this.root, item.file);
    if (!within(this.root, target)) throw new Error('File is outside your library.');
    const real = await fs.realpath(target);
    if (!within(await fs.realpath(this.root), real)) throw new Error('Linked files outside the library are not supported.');
    return real;
  }
  async scan() {
    if (!this.root) return [];
    if (this.busy) throw new Error('Please wait for the current library operation.');
    this.busy = true;
    try {
      const root = this.root;
      await fs.access(root); // An unavailable drive must never erase the index.
      const previous = this.store.items(root);
      const byFile = new Map(previous.map(i => [i.file.toLowerCase(), i]));
      const found = []; const directories=[]; const usedIds = new Set();
      const walk = async (directory, inherited = {}, inheritedCover = '', depth = 0) => {
        if (depth > 64) return;
        const entries = await fs.readdir(directory, { withFileTypes: true });
        const local = await readJson(path.join(directory, 'metadata.json'));
        const metadata = { ...inherited, ...local, files: local.files ?? {} };
        const images = entries.filter(e => e.isFile() && IMAGE.has(path.extname(e.name).toLowerCase()));
        const coverEntry = images.find(e => /^(cover|poster|folder)\./i.test(e.name)) ?? images[0];
        const declaredCover = typeof local.cover === 'string' && !local.cover.includes('/') && !local.cover.includes('\\') && IMAGE.has(path.extname(local.cover).toLowerCase()) && entries.some(e => e.isFile() && e.name === local.cover) ? local.cover : null;
        const cover = declaredCover ? path.relative(root,path.join(directory,declaredCover)) : coverEntry ? path.relative(root, path.join(directory, coverEntry.name)) : inheritedCover;
        for (const e of entries) {
          if (e.isSymbolicLink() || e.name.startsWith('.') || e.name === 'node_modules') continue;
          const absolute = path.join(directory, e.name);
          if (e.isDirectory()) { directories.push({name:e.name,path:path.relative(root,absolute)}); await walk(absolute, { genre: metadata.genre, series: metadata.series }, cover, depth + 1); continue; }
          if (!e.isFile() || !VIDEO.has(path.extname(e.name).toLowerCase())) continue;
          const file = path.relative(root, absolute);
          const stat = await fs.stat(absolute);
          const perFile = metadata.files?.[e.name] ?? {};
          const old = byFile.get(file.toLowerCase()) ?? previous.find(i => perFile.id && i.id === perFile.id && !usedIds.has(i.id));
          const info = episodeInfo(e.name);
          const pieces = file.split(path.sep);
          const inferredSeries = info.episode != null ? (pieces.length > 3 ? pieces[1] : path.basename(directory).replace(/[ ._-]*season[ ._-]*\d+/i, '')) : '';
          let id = old?.id ?? perFile.id ?? newId();
          if (typeof id !== 'string' || usedIds.has(id) || (this.store.item(id)?.root && this.store.item(id).root !== root)) id = newId();
          usedIds.add(id);
          const stem = path.parse(e.name).name;
          const onlyMovie = entries.filter(x => x.isFile() && VIDEO.has(path.extname(x.name).toLowerCase())).length === 1;
          found.push({
            id, root, file, cover: old?.coverMode==='default'?'':old?.customCover??(perFile.cover?path.relative(root,path.resolve(directory,perFile.cover)):cover), coverMode:old?.coverMode??(perFile.cover?'custom':'auto'), customCover:old?.customCover??(perFile.cover?path.relative(root,path.resolve(directory,perFile.cover)):null), hidden:old?.hidden??false,
            title: String(perFile.title ?? (onlyMovie ? metadata.title : null) ?? stem).slice(0, 200),
            genre: String(perFile.genre ?? metadata.genre ?? (pieces.length > 1 ? pieces[0] : 'Unsorted')),
            series: String(perFile.series ?? metadata.series ?? inferredSeries),
            season: perFile.season ?? info.season, episode: perFile.episode ?? info.episode, order: perFile.order ?? null,
            size: stat.size, addedAt: old?.addedAt ?? stat.birthtimeMs,
            position: old?.position ?? 0, duration: old?.duration ?? 0, watched: old?.watched ?? false,
            lastWatched: old?.lastWatched ?? null, missing: false
          });
        }
      };
      await walk(root);
      this.store.db.exec('BEGIN');
      try {
        for (const item of previous) if (!usedIds.has(item.id)) this.store.save(root, { ...item, missing: true });
        for (const item of found) this.store.save(root, item);
        this.store.set(`directories:${root}`,directories);
        if(this.location&&!directories.some(d=>d.path===this.location))this.store.set(`location:${root}`,'');
        this.store.db.exec('COMMIT');
      } catch (e) { this.store.db.exec('ROLLBACK'); throw e; }
      return this.items();
    } finally { this.busy = false; }
  }
  async importMovie(input) {
    if (this.busy || !this.root) throw new Error(this.busy ? 'A library operation is already running.' : 'Choose your library folder first.');
    this.busy=true;this.importController=new AbortController();
    const signal=this.importController.signal;
    let stage,published,artwork;
    try {
      const title=String(input.title??'').trim().slice(0,200);
      if(!title)throw new Error('A display title is required.');
      const ext=path.extname(input.video).toLowerCase();
      if(!VIDEO.has(ext))throw new Error('Choose a supported video file.');
      if(input.cover&&!IMAGE.has(path.extname(input.cover).toLowerCase()))throw new Error('Unsupported cover format.');
      for(const key of ['season','episode','order'])if(input[key]!=null&&(!Number.isInteger(input[key])||input[key]<0))throw new Error(`${key} must be a non-negative whole number.`);
      const directory=await this.directory(input.folder??this.location);
      const filename=validName(input.filename||path.parse(input.video).name)+ext;
      const destination=path.join(directory,filename);
      if(await exists(destination))throw new Error('A file with that name already exists. Choose a different filename.');
      const id=newId();
      stage=path.join(this.root,`.astra-import-${id}`);await fs.mkdir(stage);
      const stat=await fs.stat(input.video);let bytes=0,last=0;
      const source=createReadStream(input.video);
      source.on('data',chunk=>{bytes+=chunk.length;if(Date.now()-last>100){this.progress({type:'import',percent:Math.round(bytes/Math.max(1,stat.size)*100),title});last=Date.now();}});
      const staged=path.join(stage,filename);
      await pipeline(source,createWriteStream(staged,{flags:'wx'}),{signal});
      signal.throwIfAborted();
      if(input.cover){
        const artDir=path.join(directory,'.astra-art');await fs.mkdir(artDir,{recursive:true});
        if(!within(await fs.realpath(this.root),await fs.realpath(artDir)))throw new Error('Artwork directory is outside the library.');
        artwork=path.join(artDir,`${id}${path.extname(input.cover).toLowerCase()}`);
        await fs.copyFile(input.cover,artwork,require('node:fs').constants.COPYFILE_EXCL);
      }
      signal.throwIfAborted();
      // Hard-link publication is atomic and fails if an external writer created the destination.
      await fs.link(staged,destination);published=destination;
      const metadataPath=path.join(directory,'metadata.json');const meta=await readJson(metadataPath);
      await atomicJson(metadataPath,{...meta,version:1,files:{...meta.files,[filename]:{id,title,genre:String(input.genre||'Unsorted'),series:String(input.series||''),season:input.season??null,episode:input.episode??null,order:input.order??null,...(artwork?{cover:path.relative(directory,artwork)}:{})}}});
      published=null;artwork=null;
      this.progress({type:'import',percent:100,title});
    } catch(e) {
      if(published)await fs.rm(published,{force:true});
      if(artwork)await fs.rm(artwork,{force:true});
      throw e;
    } finally {
      if(stage&&within(this.root,stage)&&path.basename(stage).startsWith('.astra-import-'))await fs.rm(stage,{recursive:true,force:true});
      this.busy=false;this.importController=null;
    }
    return this.scan();
  }
  async edit(id, changes) {
    if (this.busy) throw new Error('Please wait for the current library operation.');
    this.busy = true;
    try {
      const item = this.store.item(id); const absolute = await this.absolute(item);
      const title = String(changes.title ?? item.title).trim().slice(0, 200);
      if (!title) throw new Error('A title is required.');
      const directory = path.dirname(absolute); const oldName = path.basename(absolute);
      const newName = changes.filename ? `${validName(changes.filename)}${path.extname(absolute)}` : oldName;
      const newPath = path.join(directory, newName);
      if (newName !== oldName && await exists(newPath)) throw new Error('A file with that name already exists.');
      for (const key of ['season', 'episode', 'order']) if (changes[key] != null && (!Number.isInteger(changes[key]) || changes[key] < 0)) throw new Error(`${key} must be a non-negative whole number.`);
      const newDirectory = changes.foldername && changes.foldername !== path.basename(directory) ? path.join(path.dirname(directory),validName(changes.foldername)) : directory;
      if (newDirectory !== directory && (directory === this.root || path.dirname(directory) === this.root)) throw new Error('Rename a title folder, not the library or a genre folder.');
      if (newDirectory !== directory && await exists(newDirectory)) throw new Error('A folder with that name already exists.');
      const metadataPath = path.join(directory, 'metadata.json'); const meta = await readJson(metadataPath);
      const next = { ...item, title, genre: validName(changes.genre ?? item.genre), series: String(changes.series ?? item.series).trim(), season: changes.season ?? null, episode: changes.episode ?? null, order: changes.order ?? null, file: path.relative(this.root, newPath) };
      const entry = { ...meta.files?.[oldName], id, title, genre: next.genre, series: next.series, season: next.season, episode: next.episode, order: next.order };
      const files = { ...meta.files }; delete files[oldName]; files[newName] = entry;
      let coverFile;
      if (changes.coverSource) {
        if (!IMAGE.has(path.extname(changes.coverSource).toLowerCase())) throw new Error('Unsupported cover format.');
        const artDir=path.join(directory,'.astra-art');await fs.mkdir(artDir,{recursive:true});
        if(!within(await fs.realpath(this.root),await fs.realpath(artDir)))throw new Error('Artwork directory is outside the library.');
        coverFile = path.join('.astra-art',`${newId()}${path.extname(changes.coverSource).toLowerCase()}`);
        await fs.copyFile(changes.coverSource,path.join(directory,coverFile));
        next.cover = path.relative(this.root,path.join(directory,coverFile));
        next.customCover=next.cover;next.coverMode='custom';entry.cover=coverFile;
      }
      let renamed = false, moved = false, metadataWritten = false;
      const previousMetaExists = await exists(metadataPath);
      try {
        if (newName !== oldName) { await fs.rename(absolute,newPath); renamed = true; }
        await atomicJson(metadataPath,{...meta,version:1,files}); metadataWritten = true;
        if (newDirectory !== directory) { await fs.rename(directory,newDirectory); moved = true; }
        const relocate = relative => {
          if (!relative || !within(directory,path.resolve(this.root,relative))) return relative;
          return path.relative(this.root,path.join(newDirectory,path.relative(directory,path.resolve(this.root,relative))));
        };
        this.store.db.exec('BEGIN');
        try {
          for (const sibling of this.items()) {
            const updated = sibling.id === id ? next : sibling;
            if (moved) { updated.file = relocate(updated.file); updated.cover = relocate(updated.cover); updated.customCover=relocate(updated.customCover); }
            this.store.save(this.root,updated);
          }
          this.store.db.exec('COMMIT');
        } catch(e) { this.store.db.exec('ROLLBACK'); throw e; }
      } catch(e) {
        if (moved) await fs.rename(newDirectory,directory);
        if (metadataWritten) { if(previousMetaExists) await atomicJson(metadataPath,meta); else await fs.rm(metadataPath,{force:true}); }
        if (renamed) await fs.rename(newPath,absolute);
        if (coverFile) await fs.rm(path.join(directory,coverFile),{force:true});
        throw e;
      }
      return this.items();
    } finally { this.busy = false; }
  }
  progressFor(id, position, duration, ended = false) {
    const item = this.store.item(id); if (!item) return;
    if (!Number.isFinite(position) || !Number.isFinite(duration)) return;
    this.store.save(item.root, { ...item, position: Math.max(0, position), duration: Math.max(0, duration), watched: item.watched || ended || (duration > 0 && position / duration >= .95), lastWatched: Date.now() });
  }
}
module.exports = { Library, atomicJson };
