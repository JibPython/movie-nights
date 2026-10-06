const path = require('node:path');
const { byName } = require('./core.cjs');

// Pure playback ordering; the main process is its only owner. UI windows never advance independently.
class Sequence {
  constructor({ items, queue = [], random = Math.random }) {
    this.items = items; this.queue = [...new Set(queue)]; this.random = random;
    this.currentId = null; this.source = 'folder'; this.cycle = []; this.deck = [];
    this.visited = new Set(); this.failed = new Set(); this.shuffle = false; this.repeat = 'off';
  }
  available(id) { const item = this.items().find(i=>i.id===id); return item && !item.missing && !item.hidden && !this.failed.has(id); }
  clean(ids) { return [...new Set(ids)].filter(id=>this.available(id)); }
  shuffled(ids) { const out = [...ids]; for(let i=out.length-1;i>0;i--) { const j=Math.floor(this.random()*(i+1)); [out[i],out[j]]=[out[j],out[i]]; } return out; }
  folder(id = this.currentId) {
    const current = this.items().find(i=>i.id===id); if (!current) return [];
    return this.items().filter(i=>this.available(i.id) && path.dirname(i.file)===path.dirname(current.file)).sort(byName).map(i=>i.id);
  }
  upNext() { return this.folder().filter(id=>id!==this.currentId && !this.queue.includes(id)); }
  configure({shuffle,repeat}) {
    if (this.shuffle !== shuffle) { this.shuffle=shuffle; this.deck=[]; }
    this.repeat=repeat;
  }
  append(id) {
    if (!this.available(id)) throw new Error('This video is unavailable.');
    if (id===this.currentId || this.queue.includes(id)) return;
    this.queue.push(id);
    if(this.source==='queue'&&!this.cycle.includes(id))this.cycle.push(id);
  }
  reorder(ids) {
    if(ids.length!==this.queue.length || new Set(ids).size!==ids.length || ids.some(id=>!this.queue.includes(id)))throw new Error('Queue changed; refresh and try again.');
    this.queue=[...ids]; this.deck=[];
    if(this.source==='queue')this.cycle=[...this.cycle.filter(id=>!ids.includes(id)),...ids];
  }
  remove(id) { this.queue=this.queue.filter(i=>i!==id); this.cycle=this.cycle.filter(i=>i!==id); this.deck=this.deck.filter(i=>i!==id); }
  clear() { this.queue=[]; this.cycle=[]; this.deck=[]; this.source='folder'; this.visited=new Set(this.currentId?[this.currentId]:[]); }
  start(id, fromQueue = false) {
    if(!this.available(id))throw new Error('This video is hidden or unavailable.');
    this.source=fromQueue||this.queue.includes(id)?'queue':'folder';
    this.cycle=this.source==='queue'?[id,...this.queue.filter(i=>i!==id)]:this.folder(id);
    this.visited=new Set(); this.deck=[]; this.consume(id);
  }
  consume(id) { this.currentId=id; this.queue=this.queue.filter(i=>i!==id); this.deck=this.deck.filter(i=>i!==id); this.visited.add(id); }
  choose(ids) {
    const valid=this.clean(ids); if(!valid.length)return null;
    if(!this.shuffle)return valid[0];
    this.deck=this.deck.filter(id=>valid.includes(id));
    const additions=valid.filter(id=>!this.deck.includes(id));
    this.deck.push(...this.shuffled(additions));
    return this.deck[0]??null;
  }
  next({automatic=false,autoplay=true}={}) {
    if(automatic&&!autoplay)return null;
    if(automatic&&this.repeat==='one'&&this.available(this.currentId))return this.currentId;
    this.queue=this.clean(this.queue);
    if(this.queue.length) {
      if(this.source!=='queue') { this.source='queue';this.cycle=[...this.queue];this.deck=[]; }
      return this.choose(this.queue);
    }
    if(this.source==='queue'&&this.repeat==='all') {
      this.queue=this.clean(this.cycle); this.deck=[];
      if(this.shuffle&&this.queue.length>1) { const other=this.queue.filter(id=>id!==this.currentId);this.deck=this.shuffled(other);this.deck.push(this.currentId); }
      return this.choose(this.queue);
    }
    if(this.source==='queue') { this.source='folder';this.visited=new Set([this.currentId]);this.deck=[]; }
    const folder=this.folder();
    const remaining=this.shuffle?folder.filter(id=>!this.visited.has(id)):folder.slice(folder.indexOf(this.currentId)+1);
    let id=this.choose(remaining);
    if(!id&&this.repeat==='all'&&folder.length) {
      this.visited.clear();this.deck=[];
      if(this.shuffle&&folder.length>1)this.deck=[...this.shuffled(folder.filter(i=>i!==this.currentId)),this.currentId];
      id=this.choose(folder);
    }
    return id;
  }
}
module.exports={Sequence};
