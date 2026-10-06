// Generates an original uncompressed AVI test pattern. No downloaded media.
const fs=require('node:fs');const path=require('node:path');
const width=160,height=90,fps=10,frames=50,frameBytes=width*height*3;
function chunk(id,data){const b=Buffer.alloc(8+data.length+(data.length%2));b.write(id);b.writeUInt32LE(data.length,4);data.copy(b,8);return b;}
function list(id,chunks){return chunk('LIST',Buffer.concat([Buffer.from(id),...chunks]));}
const avih=Buffer.alloc(56);avih.writeUInt32LE(1000000/fps,0);avih.writeUInt32LE(frameBytes*fps,4);avih.writeUInt32LE(16,12);avih.writeUInt32LE(frames,16);avih.writeUInt32LE(1,24);avih.writeUInt32LE(frameBytes,28);avih.writeUInt32LE(width,32);avih.writeUInt32LE(height,36);
const strh=Buffer.alloc(56);strh.write('vids');strh.write('DIB ',4);strh.writeUInt32LE(1,20);strh.writeUInt32LE(fps,24);strh.writeUInt32LE(frames,32);strh.writeUInt32LE(frameBytes,36);strh.writeUInt32LE(0xffffffff,40);strh.writeInt16LE(width,52);strh.writeInt16LE(height,54);
const strf=Buffer.alloc(40);strf.writeUInt32LE(40,0);strf.writeInt32LE(width,4);strf.writeInt32LE(height,8);strf.writeUInt16LE(1,12);strf.writeUInt16LE(24,14);strf.writeUInt32LE(frameBytes,20);
const video=[];const index=Buffer.alloc(frames*16);let offset=4;
for(let frame=0;frame<frames;frame++){const pixels=Buffer.alloc(frameBytes);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const n=(y*width+x)*3;pixels[n]=(x+frame*3)%256;pixels[n+1]=y*2;pixels[n+2]=110+frame*2;}const c=chunk('00db',pixels);video.push(c);index.write('00db',frame*16);index.writeUInt32LE(16,frame*16+4);index.writeUInt32LE(offset,frame*16+8);index.writeUInt32LE(frameBytes,frame*16+12);offset+=c.length;}
const body=Buffer.concat([Buffer.from('AVI '),list('hdrl',[chunk('avih',avih),list('strl',[chunk('strh',strh),chunk('strf',strf)])]),list('movi',video),chunk('idx1',index)]);
const result=chunk('RIFF',body);const target=path.resolve('.test-output/fixture.avi');fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,result);console.log(target);
