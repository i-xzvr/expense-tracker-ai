import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
let checked=0;
function scan(folder){
 for(const entry of fs.readdirSync(folder,{withFileTypes:true})){
  const file=path.join(folder,entry.name);
  if(entry.isDirectory())scan(file);
  else if(entry.name.endsWith('.nft.json')){
   checked++;
   for(const traced of JSON.parse(fs.readFileSync(file,'utf8')).files){
    const local=path.relative(root,path.resolve(path.dirname(file),traced)).replaceAll('\\','/');
    if(/^(?:data\/|\.runtime\/|work\/|\.env(?:$|\.))/.test(local))throw new Error('Private runtime file traced into build: '+local);
   }
  }
 }
}
scan(path.join(root,'.next'));
if(!checked)throw new Error('No production trace manifests found.');
console.log('Verified '+checked+' production trace manifests: no private runtime files.');
