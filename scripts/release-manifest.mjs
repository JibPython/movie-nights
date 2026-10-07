import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const {version}=JSON.parse(await fs.readFile('package.json','utf8'));
const files=[`Astra-${version}-Windows.exe`,`Astra-${version}-Setup.exe`];
for(const [source,name]of [['THIRD_PARTY_NOTICES.md','THIRD_PARTY_NOTICES.md'],['vendor/mpv/BUILD-SOURCE.json','BUILD-SOURCE.json'],['vendor/mpv/LICENSE.GPL','mpv-LICENSE.GPL'],['vendor/mpv/LICENSE.LGPL','mpv-LICENSE.LGPL'],['node_modules/koffi/LICENSE.txt','Koffi-LICENSE.txt']]){await fs.copyFile(source,path.join('release',name));files.push(name);}
const lines=[];for(const name of files){const data=await fs.readFile(path.join('release',name));lines.push(`${createHash('sha256').update(data).digest('hex')}  ${name}`);}
await fs.writeFile('release/SHA256SUMS.txt',lines.join('\n')+'\n');console.log('Release checksums, licenses and provenance written.');
