export type Media = {id:string;root:string;file:string;cover:string;coverMode?:'auto'|'custom'|'default';customCover?:string|null;hidden:boolean;title:string;genre:string;series:string;season:number|null;episode:number|null;order:number|null;size:number;addedAt:number;position:number;duration:number;watched:boolean;lastWatched:number|null;missing:boolean};
export type Settings = {theme:'auto'|'warm'|'cinema';cinemaStart:number;cinemaEnd:number;autoplay:boolean;shuffle:boolean;repeat:'off'|'one'|'all';volume:number;speed:number;textScale:number;playbackCompatibility:boolean};
export type PlayerMode='default'|'fullscreen'|'mini';
export type Playback={currentId:string|null;mode:PlayerMode;countdown:number|null;opening:boolean;source:'queue'|'folder'};
export type Folder={name:string;path:string};
export type BrowserState={path:string;folders:Folder[];videoIds:string[]};
export type Track={id:number;type:'audio'|'sub'|'video';title?:string;lang?:string;selected?:boolean};
export type PlayerState={position:number;duration:number;paused:boolean;volume:number;speed:number;tracks:Track[];loading:boolean;muted?:boolean;subtitleDelay?:number};
export type Snapshot={root:string;items:Media[];browser:BrowserState;queue:string[];upNext:string[];settings:Settings;collapsed:Record<string,boolean>;playback:Playback;player:PlayerState;playerReady:boolean};
export type SelectedFile={token:string;name:string};
export interface DesktopAPI{
 openPlaybackLog():Promise<void>;
 snapshot():Promise<Snapshot>;chooseRoot():Promise<Snapshot>;browse(path:string):Promise<Snapshot>;chooseDestination():Promise<string|null>;scan():Promise<Snapshot>;collapse(key:string,value:boolean):Promise<Snapshot>;
 pick(kind:'video'|'cover'|'subtitle'):Promise<SelectedFile|null>;importMovie(input:Record<string,unknown>):Promise<Snapshot>;cancelImport():Promise<void>;
 edit(id:string,input:Record<string,unknown>):Promise<Snapshot>;hide(id:string,value:boolean):Promise<Snapshot>;resetCover(id:string):Promise<Snapshot>;markWatched(id:string,value:boolean):Promise<Snapshot>;
 settings(input:Partial<Settings>):Promise<Settings>;queue(operation:'append'|'remove'|'clear'|'reorder',value?:string|string[]):Promise<Snapshot>;
 play(id:string):Promise<Snapshot>;playQueue():Promise<Snapshot>;next():Promise<Snapshot>;cancelCountdown():Promise<void>;stop():Promise<Snapshot>;
 control(action:string,value?:number|string):Promise<void>;viewport(rect:{x:number;y:number;width:number;height:number}|null):Promise<void>;obscure(value:boolean):Promise<void>;
 mode(mode:PlayerMode):Promise<Snapshot>;pinControls(value:boolean):Promise<void>;resizeMini(size:{width:number;height:number}):Promise<void>;window(action:string):Promise<void>;
 on(event:string,handler:(data:any)=>void):()=>void;
}
declare global{interface Window{astra?:DesktopAPI}}
