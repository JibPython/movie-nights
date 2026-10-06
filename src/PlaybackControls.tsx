import {useEffect,useRef,useState} from 'react';
import {Check,ChevronDown,Maximize,Minimize,Pause,PictureInPicture2,Play,SkipForward,Subtitles,Volume2,VolumeX,X} from 'lucide-react';
import {api,time,useAstra} from './state';
import {IconButton} from './ui';
import type {Snapshot} from './types';
type Run=<T>(work:()=>Promise<T>|undefined)=>Promise<T|undefined>;
export function Timeline({position,duration,onSeek}:{position:number;duration:number;onSeek:(n:number)=>void}){
 const[hover,setHover]=useState<{fraction:number;seconds:number}|null>(null),[draft,setDraft]=useState<number|null>(null);const dragging=useRef(false);
 const pointer=(e:React.PointerEvent<HTMLInputElement>)=>{const r=e.currentTarget.getBoundingClientRect(),fraction=Math.max(0,Math.min(1,(e.clientX-r.left-8)/Math.max(1,r.width-16)));setHover({fraction,seconds:fraction*duration});};
 return <div className="timeline"><div className="timeline-label-space">{hover&&duration>0&&<output role="tooltip" className="seek-tooltip" style={{left:`clamp(28px, ${hover.fraction*100}%, calc(100% - 28px))`}}>{time(hover.seconds)}</output>}</div><input aria-label="Playback position" aria-valuetext={`${time(draft??position)} of ${time(duration)}`} className="timeline-input" type="range" min="0" max={duration||1} step="0.1" disabled={!duration} value={Math.min(draft??position,duration||1)} onPointerMove={pointer} onPointerEnter={pointer} onPointerLeave={()=>{if(!dragging.current)setHover(null);}} onPointerDown={e=>{dragging.current=true;e.currentTarget.setPointerCapture(e.pointerId);pointer(e);}} onPointerUp={()=>{dragging.current=false;setDraft(null);}} onPointerCancel={()=>{dragging.current=false;setDraft(null);setHover(null);}} onChange={e=>{const value=Number(e.target.value);if(dragging.current)setDraft(value);onSeek(value);}}/></div>;
}
export function PlaybackControls({data,run,overlay=false}:{data:Snapshot;run:Run;overlay?:boolean}){
 const[speedOpen,setSpeedOpen]=useState(false),[tracksOpen,setTracksOpen]=useState(false);const p=data.player,mode=data.playback.mode,mini=mode==='mini';
 const control=(name:string,value?:number|string)=>run(()=>api?.control(name,value));
 useEffect(()=>{if(!overlay)return;void api?.pinControls(speedOpen||tracksOpen);return()=>{void api?.pinControls(false);};},[speedOpen,tracksOpen,overlay]);
 return <div className={`astra-controls ${overlay?'overlay-controls':''} ${mini?'mini-controls':''}`}>
  <Timeline position={p.position} duration={p.duration} onSeek={n=>control('seek',n)}/>
  <div className="astra-controls-row">
   <IconButton label={p.paused?'Play':'Pause'} onClick={()=>control('pause')}>{p.paused?<Play size={21} fill="currentColor"/>:<Pause size={21} fill="currentColor"/>}</IconButton>
   {!mini&&<IconButton label="Play next" onClick={()=>run(()=>api?.next())}><SkipForward size={19}/></IconButton>}
   {!mini&&<><IconButton label={p.muted?'Unmute':'Mute'} onClick={()=>control('mute')}>{p.muted?<VolumeX size={19}/>:<Volume2 size={19}/>}</IconButton><input className="volume" type="range" aria-label="Volume" min="0" max="100" value={p.volume} onChange={e=>control('volume',Number(e.target.value))}/></>}
   <span className="play-time">{time(p.position)}<i>/</i>{time(p.duration)}</span><div className="controls-spacer"/>
   {!mini&&<><div className="speed-menu"><button className="speed-trigger" aria-label="Playback speed" aria-haspopup="menu" aria-expanded={speedOpen} onClick={()=>{setSpeedOpen(!speedOpen);setTracksOpen(false);}}>{p.speed}×<ChevronDown size={13}/></button>{speedOpen&&<div className="speed-options" role="menu" aria-label="Playback speed options" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();setSpeedOpen(false);}if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const options=[...e.currentTarget.querySelectorAll<HTMLButtonElement>('button')];const index=options.indexOf(document.activeElement as HTMLButtonElement);options[(index+(e.key==='ArrowDown'?1:-1)+options.length)%options.length]?.focus();}}}>{[.25,.5,.75,1,1.25,1.5,1.75,2,2.5,3].map(n=><button key={n} role="menuitemradio" aria-checked={p.speed===n} onClick={()=>{void control('speed',n);setSpeedOpen(false);}}>{n}× {n===1&&'Normal'}{p.speed===n&&<Check size={14}/>}</button>)}</div>}</div><IconButton label="Subtitles and audio" active={tracksOpen} onClick={()=>{setTracksOpen(!tracksOpen);setSpeedOpen(false);}}><Subtitles size={20}/></IconButton></>}
   {mode==='default'&&<IconButton label="Mini-player" onClick={()=>run(()=>api?.mode('mini'))}><PictureInPicture2 size={20}/></IconButton>}
   <IconButton label={mini?'Restore player':mode==='fullscreen'?'Exit fullscreen':'Fullscreen'} onClick={()=>run(()=>api?.mode(mode==='default'?'fullscreen':'default'))}>{mode==='fullscreen'?<Minimize size={20}/>:<Maximize size={20}/>}</IconButton>
   {mini&&<IconButton label="Close mini-player" onClick={()=>run(()=>api?.stop())}><X size={19}/></IconButton>}
  </div>
  {tracksOpen&&<div className="track-settings"><label>Subtitles<select value={p.tracks.find(t=>t.type==='sub'&&t.selected)?.id??'no'} onChange={e=>control('subtitle',e.target.value==='no'?'no':Number(e.target.value))}><option value="no">Off</option>{p.tracks.filter(t=>t.type==='sub').map(t=><option key={t.id} value={t.id}>{t.title||t.lang||`Track ${t.id}`}</option>)}</select></label><button className="button secondary" onClick={()=>run(()=>api?.pick('subtitle'))}>Load subtitle file</button><label>Audio<select value={p.tracks.find(t=>t.type==='audio'&&t.selected)?.id??''} onChange={e=>control('audio',Number(e.target.value))}>{p.tracks.filter(t=>t.type==='audio').map(t=><option key={t.id} value={t.id}>{t.title||t.lang||`Track ${t.id}`}</option>)}</select></label><label>Subtitle offset (seconds)<input type="number" step="0.1" value={p.subtitleDelay??0} onChange={e=>control('subtitleDelay',Number(e.target.value))}/></label></div>}
  {data.playback.countdown!=null&&<div className="up-next-countdown"><span>Next video in {data.playback.countdown}s</span><button className="text-button" onClick={()=>run(()=>api?.cancelCountdown())}>Stay here</button><button className="button primary" onClick={()=>run(()=>api?.next())}>Play now</button></div>}
 </div>;
}
export function usePlaybackKeyboard(data:Snapshot,run:Run){
 useEffect(()=>{const key=(e:KeyboardEvent)=>{
  if(!data.playback.currentId||document.querySelector('[role=dialog]'))return;
  if(e.target instanceof HTMLElement&&(e.target.matches('input,textarea,select,button')||e.target.isContentEditable))return;
  const p=data.player;const control=(name:string,n?:number)=>run(()=>api?.control(name,n));
  if([' ','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','m','f'].includes(e.key))e.preventDefault();
  if(e.key===' ')void control('pause');if(e.key==='m')void control('mute');if(e.key==='ArrowLeft')void control('seek',Math.max(0,p.position-10));if(e.key==='ArrowRight')void control('seek',Math.min(p.duration,p.position+10));if(e.key==='ArrowUp')void control('volume',Math.min(100,p.volume+5));if(e.key==='ArrowDown')void control('volume',Math.max(0,p.volume-5));if(e.key==='f')void run(()=>api?.mode(data.playback.mode==='fullscreen'?'default':'fullscreen'));
 };window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[data,run]);
}
export function ControlsWindow(){
 const{data,run,error,setError}=useAstra();usePlaybackKeyboard(data,run);const drag=useRef<{x:number;y:number;width:number;height:number}|null>(null);
 return <div className={`native-overlay ${data.playback.mode==='mini'?'mini-overlay':''}`}><div className="overlay-drag"><span>Astra · {data.items.find(i=>i.id===data.playback.currentId)?.title}</span></div><PlaybackControls data={data} run={run} overlay/>{data.playback.mode==='mini'&&<div className="resize-grip" role="separator" aria-label="Resize mini-player" onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);drag.current={x:e.screenX,y:e.screenY,width:innerWidth,height:innerHeight};}} onPointerMove={e=>{if(drag.current)void api?.resizeMini({width:drag.current.width+e.screenX-drag.current.x,height:drag.current.height+e.screenY-drag.current.y});}} onPointerUp={()=>{drag.current=null;}}/>}{error&&<button className="overlay-error" onClick={()=>setError('')}>{error}</button>}</div>;
}
