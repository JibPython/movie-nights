// Generate actual containers/codecs locally; renaming extensions is not a format test.
import {spawnSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const output=path.resolve('.test-output','formats');await fs.mkdir(output,{recursive:true});
const mpv=path.resolve('vendor/mpv/mpv.com'),source=path.resolve('.test-output/fixture.avi');
const pcm=Buffer.alloc(44+16000*5*2);pcm.write('RIFF');pcm.writeUInt32LE(pcm.length-8,4);pcm.write('WAVEfmt ',8);pcm.writeUInt32LE(16,16);pcm.writeUInt16LE(1,20);pcm.writeUInt16LE(1,22);pcm.writeUInt32LE(16000,24);pcm.writeUInt32LE(32000,28);pcm.writeUInt16LE(2,32);pcm.writeUInt16LE(16,34);pcm.write('data',36);pcm.writeUInt32LE(pcm.length-44,40);
for(let n=0;n<16000*5;n++)pcm.writeInt16LE(Math.round(1000*Math.sin(n*2*Math.PI*440/16000)),44+n*2);
const audio=path.join(output,'tone.wav');await fs.writeFile(audio,pcm);
const matrix=[['mp4','libx264','aac'],['mkv','libx265','ac3'],['mov','mpeg4','aac'],['avi','mpeg4','libmp3lame'],['wmv','wmv2','wmav2'],['webm','libvpx-vp9','libopus'],['m4v','libx264','aac','mp4'],['mpg','mpeg2video','mp2','mpeg'],['mpeg','mpeg2video','mp2','mpeg'],['ts','libx264','aac','mpegts'],['m2ts','libx264','aac','mpegts'],['mts','libx264','aac','mpegts'],['flv','libx264','aac'],['ogv','libvpx','libvorbis','ogg']];
// This build has no Theora encoder. Test Ogg using an actual Ogg muxer with VP8.
matrix[matrix.length-1]=['ogv','libvpx','libvorbis','ogg'];
function run(args){const r=spawnSync(mpv,['--no-config','--msg-level=all=warn',...args],{encoding:'utf8',windowsHide:true,timeout:60000});assert.equal(r.status,0,r.stderr||r.error?.message||r.stdout);return r;}
for(const [ext,videoCodec,audioCodec,muxer]of matrix){
 const target=path.join(output,`sample.${ext}`);
 run([source,`--audio-file=${audio}`,'--audio-samplerate=48000','--vf=lavfi=[fps=25,format=yuv420p]',`--ovc=${videoCodec}`,`--oac=${audioCodec}`,...(muxer?[`--of=${muxer}`]:[]),`--o=${target}`]);
 assert.ok((await fs.stat(target)).size>500);
 const log=path.join(output,`${ext}.log`);
 run([target,'--vo=null','--ao=null','--hwdec=no','--untimed',`--log-file=${log}`]);
 const report=await fs.readFile(log,'utf8');assert.match(report,/Exiting\.\.\. \(End of file\)/);assert.match(report,/Video/);assert.match(report,/Audio/);
 console.log(`Decoded ${ext.toUpperCase()}: ${videoCodec} + ${audioCodec}`);
}
