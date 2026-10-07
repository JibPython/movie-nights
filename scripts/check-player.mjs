import {access,readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const root=path.resolve('vendor/mpv');
for(const file of ['mpv.exe','mpv.com','d3dcompiler_43.dll','LICENSE.GPL','LICENSE.LGPL','BUILD-SOURCE.json']){
  await access(path.join(root,file)).catch(()=>{throw new Error(`Missing bundled player file: ${file}. Run npm run setup:player before packaging.`);});
}
const executable=await readFile(path.join(root,'mpv.exe'));
const pe=executable.readUInt32LE(0x3c);
if(executable.toString('ascii',0,2)!=='MZ'||executable.toString('ascii',pe,pe+4)!=='PE\0\0'||executable.readUInt16LE(pe+4)!==0x8664)throw new Error('The bundled playback engine must be a Windows x64 executable.');
const provenance=JSON.parse(await readFile(path.join(root,'BUILD-SOURCE.json'),'utf8'));
if(!provenance.source||!provenance.asset||!provenance.sha256)throw new Error('Bundled player build provenance is incomplete.');
const result=spawnSync(path.join(root,'mpv.com'),['--no-config','--version'],{encoding:'utf8',windowsHide:true,timeout:15000});
if(result.status!==0||!result.stdout.includes('mpv '))throw new Error(`Bundled player cannot start: ${result.error?.message||result.stderr||result.stdout}`);
console.log('Bundled Windows x64 player starts successfully; required dependencies, licenses and provenance are present.');
