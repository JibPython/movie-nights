// Original moving test pattern plus a quiet 440 Hz tone. No downloaded media.
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';

const output=path.resolve('.test-output');
await fs.mkdir(output,{recursive:true});
const pcm=Buffer.alloc(44+48000*5*2);
pcm.write('RIFF');pcm.writeUInt32LE(pcm.length-8,4);pcm.write('WAVEfmt ',8);
pcm.writeUInt32LE(16,16);pcm.writeUInt16LE(1,20);pcm.writeUInt16LE(1,22);
pcm.writeUInt32LE(48000,24);pcm.writeUInt32LE(96000,28);pcm.writeUInt16LE(2,32);
pcm.writeUInt16LE(16,34);pcm.write('data',36);pcm.writeUInt32LE(pcm.length-44,40);
for(let n=0;n<48000*5;n++)pcm.writeInt16LE(Math.round(2000*Math.sin(n*2*Math.PI*440/48000)),44+n*2);
const audio=path.join(output,'fixture-tone.wav'),target=path.join(output,'fixture-av.mp4');
await fs.writeFile(audio,pcm);
const result=spawnSync(path.resolve('vendor/mpv/mpv.com'),[
  '--no-config',path.join(output,'fixture.avi'),`--audio-file=${audio}`,
  '--vf=lavfi=[format=yuv420p]','--ovc=libx264','--oac=aac',`--o=${target}`,
],{encoding:'utf8',windowsHide:true,timeout:60000});
assert.equal(result.status,0,result.error?.message||result.stderr||result.stdout);
console.log(target);
