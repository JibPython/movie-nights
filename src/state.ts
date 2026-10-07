import presets from '../desktop/theme-presets.json';
import {applyTheme} from './theme';
import {useCallback,useEffect,useState} from 'react';
import type {Snapshot,Settings} from './types';
export const api=window.astra;
export const initial:Snapshot={root:'',items:[],browser:{path:'',folders:[],videoIds:[]},queue:[],upNext:[],themes:presets,collapsed:{},settings:{activeThemeId:'navy',autoplay:true,shuffle:false,repeat:'off',volume:80,speed:1,textScale:125,playbackCompatibility:false},playback:{currentId:null,mode:'default',countdown:null,opening:false,source:'folder'},player:{position:0,duration:0,paused:true,volume:80,speed:1,tracks:[],loading:false},playerReady:false};
export function useAstra(){
 const[data,setData]=useState(initial),[error,setError]=useState('');
 const run=useCallback(async<T,>(work:()=>Promise<T>|undefined):Promise<T|undefined>=>{setError('');try{return await work();}catch(e){setError((e instanceof Error?e.message:String(e)).replace(/^Error invoking remote method 'astra': Error: /,''));}},[]);
 useEffect(()=>{
  if(!api)return;void run(async()=>setData(await api.snapshot()));
  const off=[api.on('library',setData),api.on('player',player=>setData(d=>({...d,player}))),api.on('playback',playback=>setData(d=>({...d,playback}))),api.on('failure',setError)];return()=>off.forEach(fn=>fn());
 },[run]);
 const p=data.settings;const theme=data.themes.find(t=>t.id===p.activeThemeId)||presets[1];const dark=theme.scheme==='dark';
 useEffect(()=>{applyTheme(theme);document.documentElement.style.setProperty('--text-scale',String(p.textScale/100));},[theme,p.textScale]);
 const settings=(patch:Partial<Settings>)=>{setData(d=>({...d,settings:{...d.settings,...patch}}));return run(()=>api?.settings(patch));};
 return{data,setData,run,error,setError,dark,settings};
}
export const time=(seconds:number)=>{const n=Math.floor(Math.max(0,seconds||0));return n>=3600?`${Math.floor(n/3600)}:${String(Math.floor(n/60)%60).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`:`${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;};
export const parts=(path:string)=>path.split(/[\\/]/).filter(Boolean);
