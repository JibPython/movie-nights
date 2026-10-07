const fs=require('node:fs/promises');
const {randomUUID,createHash}=require('node:crypto');
const path=require('node:path');
const presets=require('./theme-presets.json');
const fonts=['Segoe UI Variable','Segoe UI','Arial','Verdana','Trebuchet MS'];
const limit=8*1024*1024;
function validate(value,allowAssets=false){
 if(!value||typeof value!=='object'||typeof value.name!=='string'||!value.name.trim()||value.name.length>60)throw Error('Theme name must contain 1–60 characters.');
 if(!['light','dark'].includes(value.scheme)||!fonts.includes(value.font))throw Error('Invalid theme scheme or font.');
 const palette={};for(const key of Object.keys(presets[0].palette)){if(!/^#[0-9a-f]{6}$/i.test(value.palette?.[key]))throw Error(`Invalid colour: ${key}`);palette[key]=value.palette[key];}
 const effects={};for(const [key,max] of Object.entries({opacity:100,blur:40,gloss:100,radius:40,shadow:100})){const v=value.effects?.[key];if(!Number.isFinite(v)||v<0||v>max)throw Error(`Invalid effect: ${key}`);effects[key]=v;}effects.motion=value.effects?.motion===true;
 const b=value.background; if(!b||!['cover','contain'].includes(b.fit)||!['center','top','bottom','left','right'].includes(b.position)||!Number.isFinite(b.dim)||b.dim<0||b.dim>100)throw Error('Invalid background settings.');
 let image=b.image||'';const asset=allowAssets&&/^theme-art:\/\/[a-f0-9]{64}\/$/.test(image);if(typeof image!=='string'||image.length>limit||image&&!asset&&!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(image))throw Error('Background must be a local PNG, JPEG or WebP under 6 MB.');
 if(image&&!asset){const bytes=Buffer.from(image.split(',')[1],'base64');const valid=image.startsWith('data:image/png;')?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):image.startsWith('data:image/jpeg;')?bytes[0]===255&&bytes[1]===216:bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';if(!valid)throw Error('Invalid image contents.');}
 if(value.decoration!=null&&!['none','aero'].includes(value.decoration))throw Error('Invalid decoration.');
 return {decoration:value.decoration||'none',id:typeof value.id==='string'&&/^custom-[a-f0-9-]+$/.test(value.id)?value.id:`custom-${randomUUID()}`,name:value.name.trim(),scheme:value.scheme,font:value.font,palette,effects,background:{image,fit:b.fit,position:b.position,dim:b.dim}};
}
function list(store){return [...presets,...store.get('themes',[])];}
function migrate(store,hour=new Date().getHours()){
 const p=store.get('preferences',{});if(p.activeThemeId&&list(store).some(t=>t.id===p.activeThemeId))return;
 const start=p.cinemaStart??19,end=p.cinemaEnd??7;const night=start===end||(start>end?hour>=start||hour<end:hour>=start&&hour<end);
 p.activeThemeId=!p.theme||p.theme==='cinema'||(p.theme==='auto'&&night)?'navy':'light';delete p.theme;delete p.cinemaStart;delete p.cinemaEnd;store.set('preferences',p);
}
async function action(store,operation,value,{dialog,main,assetDirectory}){
 if(operation==='save'){const t=validate(value,true),all=store.get('themes',[]);if(all.length>=30&&!all.some(x=>x.id===t.id))throw Error('Maximum 30 custom themes.');
 if(t.background.image.startsWith('data:')){const bytes=Buffer.from(t.background.image.split(',')[1],'base64'),hash=createHash('sha256').update(bytes).digest('hex');await fs.mkdir(assetDirectory,{recursive:true});await fs.writeFile(path.join(assetDirectory,hash),bytes);t.background.image=`theme-art://${hash}/`;}else if(t.background.image){await fs.access(path.join(assetDirectory,new URL(t.background.image).hostname));}
store.set('themes',[...all.filter(x=>x.id!==t.id),t]);store.set('preferences',{...store.get('preferences',{}),activeThemeId:t.id});return t;}
 if(operation==='delete'){store.set('themes',store.get('themes',[]).filter(t=>t.id!==value));const p=store.get('preferences',{});if(p.activeThemeId===value)store.set('preferences',{...p,activeThemeId:'navy'});return;}
 if(operation==='image'){const r=await dialog.showOpenDialog(main,{properties:['openFile'],filters:[{name:'Background image',extensions:['png','jpg','jpeg','webp']}]});if(r.canceled)return null;const f=r.filePaths[0];if((await fs.stat(f)).size>6*1024*1024)throw Error('Image must be under 6 MB.');const ext=require('node:path').extname(f).toLowerCase();return `data:image/${ext==='.png'?'png':ext==='.webp'?'webp':'jpeg'};base64,${(await fs.readFile(f)).toString('base64')}`;}
 if(operation==='import'){const r=await dialog.showOpenDialog(main,{properties:['openFile'],filters:[{name:'Astra theme',extensions:['json']}]});if(r.canceled)return null;if((await fs.stat(r.filePaths[0])).size>limit+20000)throw Error('Theme file too large.');const doc=JSON.parse(await fs.readFile(r.filePaths[0],'utf8'));if(doc.version!==1)throw Error('Unsupported theme version.');return validate({...doc.theme,id:null});}
 if(operation==='export'){const t=validate(value,true);if(t.background.image.startsWith('theme-art:')){const bytes=await fs.readFile(path.join(assetDirectory,new URL(t.background.image).hostname));const mime=bytes[0]===137?'png':bytes[0]===255?'jpeg':'webp';t.background.image=`data:image/${mime};base64,${bytes.toString('base64')}`;}const r=await dialog.showSaveDialog(main,{defaultPath:'My theme.astra-theme.json',filters:[{name:'Astra theme',extensions:['json']}]});if(!r.canceled)await fs.writeFile(r.filePath,JSON.stringify({version:1,theme:t},null,2));return;}
 throw Error('Unknown theme action.');
}
module.exports={validate,list,migrate,action};

