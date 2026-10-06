const {contextBridge,ipcRenderer}=require('electron');
const invoke=(method,...args)=>ipcRenderer.invoke('astra',method,...args);
const methods=['snapshot','chooseRoot','browse','chooseDestination','scan','collapse','pick','importMovie','cancelImport','edit','hide','resetCover','markWatched','settings','queue','play','playQueue','next','cancelCountdown','stop','control','viewport','obscure','mode','pinControls','resizeMini','window'];
const api=Object.fromEntries(methods.map(method=>[method,(...args)=>invoke(method,...args)]));
api.on=(event,handler)=>{if(!['player','playback','failure','progress','library'].includes(event))return()=>{};const listener=(_,data)=>handler(data);ipcRenderer.on(event,listener);return()=>ipcRenderer.removeListener(event,listener);};
contextBridge.exposeInMainWorld('astra',api);
