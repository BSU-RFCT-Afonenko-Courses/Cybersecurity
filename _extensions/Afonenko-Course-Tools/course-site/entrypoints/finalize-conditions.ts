// Host упаковка принятого public snapshot; этот вход не создаёт NativeRun.
import {stageConditions,digest} from '../application/conditions.ts';
import {resolve,dirname,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const [manifestFile,outputRoot]=Deno.args;
if(!manifestFile||!outputRoot)throw Error('Требуются manifest.json и новый output root');
const manifest=JSON.parse(await Deno.readTextFile(manifestFile));
async function guards(){for(const f of manifest.inputs){let current=resolve(f.path);for(;;){if((await Deno.lstat(current)).isSymlink)throw Error('Linked input '+f.path);const next=dirname(current);if(next===current)break;current=next;}const stat=await Deno.lstat(f.path);if(!stat.isFile||stat.isSymlink||stat.size!==f.bytes||await digest(await Deno.readFile(f.path))!==f.sha256)throw Error('Изменился вход: '+f.path);}}
await guards();try{await Deno.lstat(outputRoot);throw Error('Output уже существует');}catch(e){if(!(e instanceof Deno.errors.NotFound))throw e;}
let parent=resolve(dirname(outputRoot));for(;;){const stat=await Deno.lstat(parent);if(stat.isSymlink)throw Error('Linked output parent');const next=dirname(parent);if(next===parent)break;parent=next;}
const load=async(file:string)=>await import(pathToFileURL(resolve(file)).href);
const staged=await stageConditions(manifest.conditions,{publicLinks:(await load(manifest.modules.core)).publicLinks,createBodyLinks:(await load(manifest.modules.qrc)).createBodyLinks,zip:(await load(manifest.modules.download)).zip});
await guards();
await Deno.mkdir(outputRoot);
for(const item of staged){const target=resolve(outputRoot,item.path);if(!target.startsWith(resolve(outputRoot)+'/'))throw Error('Output path');await Deno.mkdir(dirname(target),{recursive:true});await Deno.writeFile(target,item.bytes,{createNew:true});}
await guards();
await Deno.writeTextFile(join(outputRoot,'conditions-provenance.json'),JSON.stringify({...manifest.provenance,sourceInputs:manifest.inputs,results:staged.map(({bytes,...facts})=>facts)},null,2)+'\n',{createNew:true});
console.log(JSON.stringify({archives:staged.length,links:staged.reduce((n,x)=>n+x.resolved.length,0)}));
