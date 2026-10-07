import {useCallback,useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import {ArrowLeft,ArrowRight,ChevronDown,Clapperboard,Film,Folder,FolderOpen,House,ListOrdered,Minus,Moon,Plus,RefreshCw,Search,Settings2,SlidersHorizontal,Sparkles,Square,Sun,X} from 'lucide-react';
import {api,parts,useAstra} from './state';
import type {Media} from './types';
import {Card,Empty,IconButton,Modal,Section} from './ui';
import {MovieForm} from './MovieForm';
import {SettingsPanel} from './SettingsPanel';
import {QueueView,PlaybackOptions,UpNext} from './QueueView';
import {ControlsWindow,PlaybackControls,usePlaybackKeyboard} from './PlaybackControls';
import './styles.css';
import './text-size.css';
import './astra.css';
import './themes.css';

const overlay=new URLSearchParams(location.search).get('surface')==='controls';
document.documentElement.dataset.surface=overlay?'controls':'main';
function App(){
 const{data,run,error,setError,dark,settings}=useAstra();
 const[view,setView]=useState<'home'|'queue'|'watch'>('home'),[query,setQuery]=useState(''),[filter,setFilter]=useState('all');
 const[modal,setModal]=useState<'import'|'settings'|{id:string}|null>(null),[busy,setBusy]=useState(false);
 const[notice,setNotice]=useState<{message:string;undo?:()=>void}|null>(null);const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const videoRect=useRef<HTMLDivElement>(null);const active=data.items.find(i=>i.id===data.playback.currentId);const mode=data.playback.mode;
 const closeModal=useCallback(()=>setModal(null),[]);
 const notify=(message:string,undo?:()=>void)=>{setNotice({message,undo});if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>setNotice(null),9000);};
 useEffect(()=>{if(data.playback.currentId&&mode!=='mini'){setView('watch');setModal(null);}else if(!data.playback.currentId||mode==='mini')setView(v=>v==='watch'?'home':v);},[data.playback.currentId,mode]);
 useEffect(()=>{void api?.obscure(!!modal);},[modal]);
 usePlaybackKeyboard(data,run);
 useLayoutEffect(()=>{
  if(view!=='watch'||mode!=='default'||!active||!videoRect.current){if(mode==='default')void api?.viewport(null);return;}
  const element=videoRect.current;
  const update=()=>{const r=element.getBoundingClientRect();void api?.viewport({x:r.x,y:r.y,width:r.width,height:r.height});};
  const observer=new ResizeObserver(update);observer.observe(element);window.addEventListener('resize',update);window.addEventListener('scroll',update,true);update();
  return()=>{observer.disconnect();window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true);if(mode==='default')void api?.viewport(null);};
 },[view,mode,active?.id,data.settings.textScale]);
 const desktop=()=>{if(!api){setError('Open the Astra desktop application to use local files.');return false;}return true;};
 const chooseRoot=()=>run(async()=>{if(!desktop())return;setBusy(true);try{await api!.chooseRoot();setView('home');setQuery('');}finally{setBusy(false);}});
 const browse=(path:string)=>run(async()=>{if(active&&mode==='default')await api?.mode('mini');await api?.browse(path);setView('home');setQuery('');});
 const play=(item:Media)=>run(()=>api?.play(item.id));
 const addQueue=(item:Media)=>run(async()=>{await api?.queue('append',item.id);notify(`${item.title} is in your queue.`);});
 const hide=(item:Media)=>run(async()=>{await api?.hide(item.id,true);closeModal();notify(`${item.title} hidden. Its file is unchanged.`,()=>{void run(()=>api?.hide(item.id,false));setNotice(null);});});
 const scan=()=>run(async()=>{setBusy(true);try{await api?.scan();}finally{setBusy(false);}});
 const currentParts=parts(data.browser.path);const rootName=parts(data.root).pop()||'Library';
 const visible=data.items.filter(i=>!i.hidden);const byId=new Map(visible.map(i=>[i.id,i]));
 const matches=(item:Media)=>(filter==='all'||(filter==='watched'?item.watched:!item.watched));
 const scopePrefix=data.browser.path?data.browser.path+'\\':'';
 const search=visible.filter(i=>(!scopePrefix||i.file.toLowerCase().startsWith(scopePrefix.toLowerCase()))&&`${i.title} ${i.series} ${i.file}`.toLowerCase().includes(query.toLowerCase())&&matches(i)).sort((a,b)=>a.title.localeCompare(b.title,undefined,{numeric:true,sensitivity:'base'}));
 const direct=data.browser.videoIds.map(id=>byId.get(id)).filter((i):i is Media=>!!i&&matches(i));
 const cards=(items:Media[],paths=false)=><div className="movie-grid">{items.map(item=><Card key={item.id} item={item} onPlay={play} onQueue={addQueue} onEdit={i=>setModal({id:i.id})} pathLabel={paths?parts(item.file).slice(0,-1).join(' / '):undefined}/>)}</div>;
 const section=(key:string,title:string,count:number,children:ReactNode)=>{const id=`${data.browser.path}|${key}`;return <Section title={title} count={count} collapsed={Boolean(data.collapsed[id])} onToggle={()=>run(()=>api?.collapse(id,!data.collapsed[id]))}>{children}</Section>;};
 const recent=[...visible].filter(matches).sort((a,b)=>b.addedAt-a.addedAt).slice(0,8);
 const resume=visible.filter(i=>i.position>0&&!i.watched&&!i.missing&&matches(i)).sort((a,b)=>(b.lastWatched??0)-(a.lastWatched??0));
 const editItem=typeof modal==='object'&&modal?data.items.find(i=>i.id===modal.id):undefined;
 const watch=view==='watch'&&!!active&&mode!=='mini';
 return <div className={`app astra-app ${watch?'watching':''} ${mode==='fullscreen'?'is-fullscreen':''}`}>
  <div className="titlebar"><span className="titlebar-label">ASTRA <span>/</span> A LITTLE TIME FOR A GOOD FILM</span><div className="window-actions"><IconButton label="Minimize window" onClick={()=>api?.window('minimize')}><Minus size={14}/></IconButton><IconButton label="Maximize window" onClick={()=>api?.window('maximize')}><Square size={11}/></IconButton><IconButton label="Close window" onClick={()=>api?.window('close')}><X size={15}/></IconButton></div></div>
  {!watch&&<aside className="sidebar"><a className="brand" href="#" onClick={e=>{e.preventDefault();void browse('');}}><span className="brand-icon"><Clapperboard size={24}/></span><span>Astra<span className="brand-dot">.</span><small>YOUR OWN LITTLE CINEMA</small></span></a><div className="sidebar-label">YOUR SPACE</div><nav><button className={view==='home'?'selected':''} onClick={()=>browse('')}><House size={18}/><span>Home</span></button><button className={view==='queue'?'selected':''} onClick={()=>setView('queue')}><ListOrdered size={18}/><span>Queue</span><span className="nav-count">{data.queue.length}</span></button></nav>
   {mode==='mini'&&active&&<button className="mini-now-playing" onClick={()=>run(()=>api?.mode('default'))}><span className="status-dot"/><span>Playing in mini-player<strong>{active.title}</strong><small>Return to video ↗</small></span></button>}
   <div className="sidebar-bottom"><div className="local-note"><span className="status-dot"/>Entirely yours. Entirely local.</div><button className="library-location" onClick={chooseRoot} title={data.root||'Choose a library folder'}><FolderOpen size={17}/><span>{data.root?rootName:'Choose library folder'}<small>{data.root?'Your movie library':'Give your films a home'}</small></span><ChevronDown size={13}/></button><button className="settings-nav" onClick={()=>setModal('settings')}><Settings2 size={17}/>Settings & preferences</button></div></aside>}
  <main className={watch?'watch-main':'main'}>
   {!watch?<><header className="topbar"><nav className="breadcrumb" aria-label="Folder location"><button onClick={()=>browse('')}>{rootName}</button>{view==='queue'?<><span>/</span><strong>Queue</strong></>:currentParts.map((part,index)=><span className="breadcrumb-part" key={index}><span>/</span><button aria-current={index===currentParts.length-1?'page':undefined} onClick={()=>browse(currentParts.slice(0,index+1).join('\\'))}>{part}</button></span>)}</nav><div className="topbar-actions"><label className="search"><Search size={16}/><input placeholder="Search this folder" aria-label="Search library" value={query} onChange={e=>{setQuery(e.target.value);setView('home');}}/></label><IconButton label={`Switch to ${dark?'light':'navy'} theme`} onClick={()=>settings({activeThemeId:dark?'light':'navy'})}>{dark?<Moon size={18}/>:<Sun size={19}/>}</IconButton><button className="button primary add-button" onClick={()=>data.root?setModal('import'):chooseRoot()}><Plus size={16}/>Add a video</button></div></header>
    <div className="library-content">
     {view==='home'&&!data.browser.path&&!query&&<section className="hero"><div className="hero-copy"><span className="eyebrow"><span className="status-dot"/>{dark?'THE LIGHTS ARE LOW. SETTLE IN.':'SLOW DOWN. PRESS PLAY.'}</span><h1>Good films.<br/><em>Your own time.</em></h1><p>{visible.length?'An old favourite. Something unexpected.\nYour next great watch is already here.':'A home for the films you love.\nNo feeds, no noise. Just you and the story.'}</p><div className="hero-actions"><button className="button primary" onClick={()=>resume.length?play(resume[0]):data.root?setModal('import'):chooseRoot()}><FolderOpen size={16}/>{resume.length?'Continue watching':data.root?'Add to your collection':'Choose your movie folder'}<ArrowRight size={16}/></button><span className="hero-footnote">{visible.length?`${visible.length} stories, one little cinema`:'Your collection starts here'}</span></div></div><div className="hero-art" aria-hidden="true"><div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/><div className="art-ticket"><span>ASTRA PICTURE HOUSE</span><div className="ticket-symbol"><Sparkles size={30}/></div><strong>ADMIT<br/>YOURSELF.</strong><div className="ticket-rule"/><small>ANY FILM · ANY TIME</small><div className="ticket-bottom"><span>SEAT<br/><b>01</b></span><span>SCREEN<br/><b>YOURS</b></span><div className="barcode"/></div></div><span className="art-caption">THE BEST SEAT IS THE ONE AT HOME.</span></div></section>}
     <div className="collection-toolbar"><div><span className="eyebrow">{view==='queue'?'ONE GOOD FILM AFTER ANOTHER':'YOUR FILES, YOUR FOLDERS'}</span><h2>{view==='queue'?'Your queue':query?`Results for “${query}”`:currentParts.at(-1)||'Your collection'}</h2></div><div className="toolbar-options">{view!=='queue'&&<label><SlidersHorizontal size={14}/><select aria-label="Watched filter" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All titles</option><option value="unwatched">Unwatched</option><option value="watched">Watched</option></select></label>}<IconButton label="Refresh library" disabled={!data.root||busy} onClick={scan}><RefreshCw size={16} className={busy?'spin':''}/></IconButton></div></div>
     {view==='queue'?<><PlaybackOptions settings={data.settings} onChange={settings}/><QueueView data={data} run={run}/></>:!data.root?<Empty title="Every collection starts with a first film." body="Choose a folder of videos you already own. Its folders will appear exactly as you arranged them." icon={<Film size={30}/>} action={<button className="button secondary" onClick={chooseRoot}><Plus size={15}/>Set up your library</button>}/>:query?(search.length?cards(search,true):<Empty title="No videos found." body="Try a different name or browse another folder." icon={<Search size={26}/>}/>):<>
      {data.browser.folders.length>0&&section('folders','Folders',data.browser.folders.length,<div className="folder-grid">{data.browser.folders.map(folder=><button className="folder-card" key={folder.path} onClick={()=>browse(folder.path)} aria-label={`Open folder ${folder.name}`}><span className="folder-art"><Folder size={42} strokeWidth={1.1}/></span><strong>{folder.name}</strong><span>Open folder <ArrowRight size={14}/></span></button>)}</div>)}
      {direct.length>0&&section('videos','Videos',direct.length,cards(direct))}
      {!data.browser.path&&resume.length>0&&section('continue','Continue watching',resume.length,cards(resume))}
      {!data.browser.path&&recent.length>0&&section('recent','Recently added',recent.length,cards(recent))}
      {!data.browser.folders.length&&!direct.length&&<Empty title="A little room for a good story." body="This folder has no visible videos matching your filter. Add a video, adjust the filter, or open Settings to restore hidden titles." icon={<FolderOpen size={28}/>} action={<button className="button secondary" onClick={()=>setModal('import')}><Plus size={15}/>Add a video here</button>}/>}
     </>}
     <footer className="library-footer"><span><Clapperboard size={13}/>A quieter kind of movie night.</span><span>{dark?<Moon size={12}/>:<Sun size={13}/>} {data.themes.find(t=>t.id===data.settings.activeThemeId)?.name} theme</span></footer>
    </div></>:mode==='fullscreen'?<div className="fullscreen-stage"/>:<><header className="watch-header"><button className="text-button" onClick={()=>run(()=>api?.mode('mini'))}><ArrowLeft size={17}/>Back to collection</button><button className="text-button" onClick={()=>run(()=>api?.stop())}>Stop video</button></header><div className="watch-layout astra-watch-layout"><section className="watch-primary astra-watch-primary"><div className="astra-video-frame" ref={videoRect} onDoubleClick={()=>run(()=>api?.mode('fullscreen'))}><Clapperboard size={38}/><span>{data.playback.opening?'Setting the scene…':'Your local cinema'}</span></div><PlaybackControls data={data} run={run}/><div className="now-playing"><div><span className="eyebrow">{active.series||active.genre}</span><h1>{active.title}</h1><p><span className="status-dot"/>Playing from your library <span>·</span>{parts(active.file).pop()}</p></div></div></section><aside className="up-next"><PlaybackOptions settings={data.settings} onChange={settings}/><QueueView data={data} run={run} compact/><UpNext data={data} run={run}/></aside></div></>}
  </main>
  {busy&&<div className="busy-pill"><RefreshCw size={14} className="spin"/>Refreshing library…</div>}
  {(error||notice)&&<div className="toast" role="status"><span>{error||notice?.message}</span>{!error&&notice?.undo&&<button onClick={notice.undo}>Undo</button>}<button aria-label="Dismiss notification" onClick={()=>{setError('');setNotice(null);}}><X size={16}/></button></div>}
  {modal&&<Modal title={modal==='settings'?'Make yourself comfortable.':modal==='import'?'A new addition to the shelves.':'A little fine-tuning.'} onClose={closeModal}>{modal==='settings'?<SettingsPanel data={data} change={settings} run={run}/>:<MovieForm key={editItem?.id??'import'} item={editItem} data={data} onSaved={()=>{closeModal();notify(editItem?'Changes saved.':'Your video is in the library.');}} onHide={hide}/>}</Modal>}
 </div>;
}
createRoot(document.getElementById('root')!).render(overlay?<ControlsWindow/>:<App/>);
