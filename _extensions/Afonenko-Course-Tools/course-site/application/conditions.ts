import {dirname,join,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
export interface ConditionsInput {
 siteRoot:string; baseUrl:string; catalogFile:string;
 sourcePages:Record<string,string>;
 archives:{path:string;id:string;source:string;namespace:string;sha256?:string}[];
}
export interface ConditionsModules { publicLinks:Function; createBodyLinks:Function; zip:Function }
const decoder=new TextDecoder();
export async function digest(bytes:Uint8Array){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function refuse(message:string):never{throw Error('SITE.CONDITIONS_INVALID: '+message);}
async function regular(root:string,path:string){
 const rel=relative(resolve(root),resolve(root,path));if(!rel||rel.startsWith('..')||rel.startsWith('/'))refuse('Путь вне публичного результата: '+path);
 let current=resolve(root);if((await Deno.lstat(current)).isSymlink)refuse('Ссылка вместо корня');
 for(const part of rel.split('/')){current=join(current,part);const s=await Deno.lstat(current);if(s.isSymlink)refuse('Символическая ссылка: '+path);}
 if(!(await Deno.lstat(current)).isFile)refuse('Ожидался regular file: '+path);return current;
}
async function command(tool:string,args:string[],input:Uint8Array){
 const child=new Deno.Command(tool,{args,stdin:'piped',stdout:'piped',stderr:'piped'}).spawn();
 const writing=(async()=>{const w=child.stdin.getWriter();await w.write(input);await w.close();})();const output=await child.output();await writing;
 if(!output.success||output.stderr.length)refuse(tool+': '+decoder.decode(output.stderr));return output.stdout;
}
const readZip=String.raw`import sys,zipfile,io,json,base64,stat
from html.parser import HTMLParser
class Transport(HTMLParser):
 def handle_starttag(self,tag,attrs):
  seen=set(); whitelist={'qrc-ref','qrc-style','qrc-custom','qrc-deferred'}
  for key,value in attrs:
   if key in whitelist: raise ValueError('unprefixed QRC transport')
   if key.startswith('data-') and key[5:] in whitelist:
    if key in seen: raise ValueError('duplicate QRC transport')
    seen.add(key)
 def handle_startendtag(self,tag,attrs): self.handle_starttag(tag,attrs)
b=sys.stdin.buffer.read(67108865)
if len(b)>67108864: raise ValueError('ZIP size')
with zipfile.ZipFile(io.BytesIO(b)) as z:
 infos=z.infolist(); names=set(); total=0; out=[]
 if len(infos)>256: raise ValueError('ZIP members')
 for i in infos:
  n=i.filename; mode=i.external_attr>>16
  if not n or n.startswith('/') or '\\' in n or any(p in ('','.','..') for p in n.split('/')) or n in names: raise ValueError('ZIP path/duplicate')
  if i.is_dir() or (stat.S_IFMT(mode) not in (0,stat.S_IFREG)) or i.flag_bits&1: raise ValueError('ZIP entry kind')
  names.add(n);total+=i.file_size
  if total>67108864 or i.file_size>33554432: raise ValueError('ZIP expanded size')
  data=z.read(i)
  if n=='index.html':
   check=Transport(convert_charrefs=False);check.feed(data.decode('utf-8'));check.close()
  out.append({'name':n,'base64':base64.b64encode(data).decode()})
 if list(names).count('index.html')!=1: raise ValueError('ZIP index')
 print(json.dumps(out))`;
/** Только public artifacts: не загружает и не изменяет NativeRun/receipt. */
export async function stageConditions(input:ConditionsInput,modules:ConditionsModules){
 const root=resolve(input.siteRoot), before=new Map<string,string>();
 async function read(path:string){const f=await regular(root,path),b=await Deno.readFile(f),h=await digest(b);const old=before.get(path);if(old&&old!==h)refuse('Input drift: '+path);before.set(path,h);return b;}
 const catalog=JSON.parse(decoder.decode(await read(input.catalogFile)));const links=modules.createBodyLinks({catalog,baseUrl:input.baseUrl});const base=new URL(input.baseUrl);if(!['https:','http:'].includes(base.protocol)||!base.pathname.endsWith('/'))refuse('Публичная база');
 const pandoc=Deno.env.get('QUARTO_PANDOC')||join(Deno.env.get('QUARTO_BIN_PATH')||dirname(Deno.env.get('QUARTO')||'/opt/quarto/bin/quarto'),'tools',Deno.build.arch==='x86_64'?'x86_64':'aarch64','pandoc');
 const python=Deno.env.get('QUARTO_PYTHON')||'python3';
 const filter=join(dirname(fileURLToPath(import.meta.url)),'qrc-transport.lua');
 const toolPaths=[pandoc,filter,await regular(dirname(fileURLToPath(import.meta.url)), 'conditions.ts')];
 const identities=await Promise.all(toolPaths.map(async path=>({path,sha256:await digest(await Deno.readFile(path))})));
 const native=async(bytes:Uint8Array)=>JSON.parse(decoder.decode(await command(pandoc,['--from=html','--to=json','--lua-filter='+filter],bytes)));
 const staged=[];const seen=new Set<string>();
 for(const archive of input.archives){
  if(seen.has(archive.path)||!archive.id||!archive.namespace||!input.sourcePages[archive.source])refuse('Повтор/неполная ассоциация source');seen.add(archive.path);
  const bytes=await read(archive.path);if(archive.sha256&&await digest(bytes)!==archive.sha256)refuse('Исходный ZIP hash');
  const raw=JSON.parse(decoder.decode(await command(python,['-c',readZip],bytes)));
  const entries=raw.map((e:any)=>({name:e.name,bytes:Uint8Array.from(atob(e.base64),(c:string)=>c.charCodeAt(0))}));
  const index=entries.find((e:any)=>e.name==='index.html');const ast=await native(index.bytes);
  // Actual source→composed page задаётся collection authority, не сменой suffix.
  const ownTarget=catalog.targets[archive.namespace+':'+archive.id];
  if(!ownTarget||ownTarget.page!==input.sourcePages[archive.source]||ownTarget.fragment!==archive.id)refuse('Source/catalog mapping mismatch');
  await read(input.sourcePages[archive.source]);
  const resolved:any[]=[];
  ast.blocks=await modules.publicLinks(ast.blocks,{id:archive.id,source:archive.source},{namespace:archive.namespace,sourceUrl:(source:string)=>{const page=input.sourcePages[source];if(!page)refuse('Неизвестный canonical source: '+source);return new URL(page,base).href;},resolve:async(key:string,style:string,source:string)=>{
   const target=catalog.targets[key];if(!target||target.baseUrl||target.namespace!==key.split(':')[0])refuse('Чужая/отсутствующая цель '+key);
   const page=await native(await read(target.page));let count=0;const visit=(v:any)=>{if(Array.isArray(v)){if(v.length===3&&v[0]===target.fragment&&Array.isArray(v[1])&&Array.isArray(v[2]))count++;v.forEach(visit);}else if(v&&typeof v==='object')Object.values(v).forEach(visit);};visit(page.blocks);if(target.slide&&target.slide!==target.fragment){let slides=0;const scan=(v:any)=>{if(Array.isArray(v)){if(v.length===3&&v[0]===target.slide&&Array.isArray(v[1])&&Array.isArray(v[2]))slides++;v.forEach(scan);}else if(v&&typeof v==='object')Object.values(v).forEach(scan);};scan(page.blocks);if(slides!==1)refuse('Missing Reveal slide '+key);}
   if(count!==1)refuse('Неоднозначная/отсутствующая target anchor '+key);
   const result=links.resolve(key,style,source);const href=new URL(result.href);if(href.origin!==base.origin||!href.pathname.startsWith(base.pathname))refuse('Чужой URL '+key);resolved.push({key,style,...result});return result;
  }});
  // HTML title остаётся в head; standalone writer не добавляет его в body.
  if(ast.meta.title){ast.meta.pagetitle=ast.meta.title;delete ast.meta.title;}
  const transformed=await command(pandoc,['--from=json','--to=html5','--standalone','--wrap=none'],new TextEncoder().encode(JSON.stringify(ast)));
  if(/data-qrc-(?:ref|deferred)=/.test(decoder.decode(transformed)))refuse('Остались deferred transport');
  const oldIndex=await digest(index.bytes);index.bytes=transformed;
  const output=modules.zip(entries);
  staged.push({path:archive.path,bytes:output,originalSha256:await digest(bytes),sha256:await digest(output),indexBefore:oldIndex,indexAfter:await digest(transformed),resolved,members:await Promise.all(entries.map(async(e:any)=>({path:e.name,bytes:e.bytes.length,sha256:await digest(e.bytes)})))});
 }
 for(const [path,h]of before)if(await digest(await Deno.readFile(await regular(root,path)))!==h)refuse('Input drift: '+path);
 for(const t of identities)if(await digest(await Deno.readFile(t.path))!==t.sha256)refuse('Tool/module drift');
 return staged;
}

/** Ассоциации только из Download receipt и уже принятой Site collection. */
export async function collectConditions(siteRoot:string,records:any[],baseUrl:string){
 const sourcePages:Record<string,string>={},archives:ConditionsInput['archives']=[];
 for(const {project,record,nativeRuns,config} of records){
  for(const run of nativeRuns||[])for(const d of run.documents){
   const output=resolve(record.outputDir,d.document.output);
   if(!record.nativeOutputs.includes(output))refuse('Документ вне nativeOutputs');
   const source=join(project.mount,d.source);const page=join(project.mount,relative(record.outputDir,output));
   if(sourcePages[source]&&sourcePages[source]!==page)refuse('Неоднозначный source mapping');sourcePages[source]=page;
  }
  const receiptPath=join(project.path,'_generated/project-download/artifacts-receipt.json');let receipt:any;
  try{receipt=JSON.parse(await Deno.readTextFile(await regular(project.path,receiptPath)));}catch(e){if(e instanceof Deno.errors.NotFound)continue;throw e;}
  if(receipt.schema!=='project-download-artifacts-v1'||!receipt.sourceRunHash||JSON.stringify(receipt.profiles)!==JSON.stringify(record.profiles)||receipt.audience!==config.course?.view)refuse('Чужой Download receipt');
  for(const a of receipt.archives){if(a.kind!=='conditions')continue;
   const docs=(nativeRuns||[]).flatMap((r:any)=>r.documents).filter((d:any)=>d.source===a.source);
   const owned=docs.some((d:any)=>[...d.exercises||[],...d.projects||[],...d.body?.publicExercises||[]].some((x:any)=>x.id===a.exerciseId));
   if(!owned||a.audience!==receipt.audience||a.name!==a.exerciseId+'-conditions.zip')refuse('Нет public model association');
   const rel=join('_downloads',a.name);if(!record.files.includes(join(record.outputDir,rel)))refuse('ZIP вне collection');
   archives.push({path:join(project.mount,rel),id:a.exerciseId,source:join(project.mount,a.source),namespace:config['reference-catalog']?.namespace,sha256:a.sha256});
  }
 }
 return {siteRoot,baseUrl,catalogFile:'reference-catalog.json',sourcePages,archives};
}
