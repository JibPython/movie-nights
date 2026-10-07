import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export async function buildAstra({root,run,write,openFolder,platform=process.platform,arch=process.arch,nodeVersion=process.versions.node,npm=path.join(path.dirname(process.execPath),'node_modules','npm','bin','npm-cli.js'),exists=fs.existsSync}){
 if(platform!=='win32'||arch!=='x64'||Number(nodeVersion.split('.')[0])!==24)throw Error('Install Node.js 24 LTS for Windows x64 from https://nodejs.org/ and try again.');
 if(!exists(npm))throw Error('npm was not found next to Node.js. Reinstall Node.js 24 with npm included.');
 const npmRun=args=>run(process.execPath,[npm,...args],root);
 write('\n[1/3] Installing exact dependencies\n');await npmRun(['ci']);
 write('\n[2/3] Checking bundled player\n');try{await run(process.execPath,['scripts/check-player.mjs'],root);}catch{write('Preparing pinned player build\n');await npmRun(['run','setup:player']);await run(process.execPath,['scripts/check-player.mjs'],root);}
 write('\n[3/3] Packaging Astra\n');await npmRun(['run','package']);
 const release=path.join(root,'release');write(`\nBuild complete: ${release}\n`);openFolder(release);
}
export async function main(){
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');process.chdir(root);
 const logPath=path.join(root,'astra-build.log'),log=fs.createWriteStream(logPath,{flags:'w'});
 const write=s=>{process.stdout.write(s);log.write(s);};
 const run=(file,args,cwd)=>new Promise((resolve,reject)=>{const child=spawn(file,args,{cwd,windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>write(b.toString()));child.stderr.on('data',b=>write(b.toString()));child.on('error',reject);child.on('close',code=>code===0?resolve():reject(Error(`${file} exited with code ${code}`)));});
 const openFolder=folder=>{const child=spawn('explorer.exe',[folder],{detached:true,windowsHide:true,stdio:'ignore'});child.on('error',()=>write('Open the release folder in File Explorer.\n'));child.unref();};
 try{write(`Astra build - log: ${logPath}\n`);await buildAstra({root,run,write,openFolder});}catch(error){write(`\nBUILD FAILED: ${error.message}\nLog: ${logPath}\n`);process.exitCode=1;}finally{log.end();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
