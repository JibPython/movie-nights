// Code-drawn clapperboard icon, supersampled and encoded as PNG-backed ICO.
const fs=require('node:fs');const path=require('node:path');const zlib=require('node:zlib');
const target=path.resolve('assets');fs.mkdirSync(target,{recursive:true});
function crc32(bytes){let crc=0xffffffff;for(const b of bytes){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function pngChunk(type,data){const tag=Buffer.from(type),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);tag.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc32(Buffer.concat([tag,data])),8+data.length);return out;}
function round(x,y,l,t,r,b,radius){const cx=Math.max(l+radius,Math.min(r-radius,x)),cy=Math.max(t+radius,Math.min(b-radius,y));return (x-cx)**2+(y-cy)**2<=radius**2&&x>=l&&x<=r&&y>=t&&y<=b;}
function color(x,y){
  if(!round(x,y,.03,.03,.97,.97,.22))return [0,0,0,0];
  let ink=round(x,y,.22,.43,.79,.77,.04)&&!round(x,y,.27,.47,.74,.72,.015);
  const yy=y+.15*x;
  if(x>=.22&&x<=.79&&yy>=.31&&yy<=.46){ink=true;if(yy>.345&&yy<.435&&((x+yy*.7)*12)%2<.8)ink=false;}
  if(round(x,y,.34,.56,.64,.59,.012))ink=true;
  return ink?[240,233,209,255]:[83,99,64,255];
}
function png(size){const raw=Buffer.alloc((size*4+1)*size);for(let y=0;y<size;y++){for(let x=0;x<size;x++){const sum=[0,0,0,0];for(let a=0;a<4;a++)for(let b=0;b<4;b++){const c=color((x+(a+.5)/4)/size,(y+(b+.5)/4)/size);for(let i=0;i<4;i++)sum[i]+=c[i];}for(let i=0;i<4;i++)raw[y*(size*4+1)+1+x*4+i]=Math.round(sum[i]/16);}}const head=Buffer.alloc(13);head.writeUInt32BE(size,0);head.writeUInt32BE(size,4);head[8]=8;head[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pngChunk('IHDR',head),pngChunk('IDAT',zlib.deflateSync(raw)),pngChunk('IEND',Buffer.alloc(0))]);}
const sizes=[16,32,48,256];const images=sizes.map(png);const header=Buffer.alloc(6+16*sizes.length);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);let offset=header.length;images.forEach((image,i)=>{const p=6+i*16;header[p]=sizes[i]===256?0:sizes[i];header[p+1]=header[p];header.writeUInt16LE(1,p+4);header.writeUInt16LE(32,p+6);header.writeUInt32LE(image.length,p+8);header.writeUInt32LE(offset,p+12);offset+=image.length;});fs.writeFileSync(path.join(target,'astra.ico'),Buffer.concat([header,...images]));fs.writeFileSync(path.join(target,'astra.png'),images[3]);
