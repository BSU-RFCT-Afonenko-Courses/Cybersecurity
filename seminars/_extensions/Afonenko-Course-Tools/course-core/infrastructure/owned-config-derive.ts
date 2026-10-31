/** Две точные native-computed input операции ARCH84, не schema sanitizer. */
import {join,basename,dirname,resolve} from 'stdlib/path';
import {diagnostic} from '../domain/diagnostics.ts';
import {metadataBytes} from './metadata-closure.ts';
const fail=(message:string):never=>{throw diagnostic('NATIVE.COMMON_PATH_BINDING_INVALID',message,{field:'project-materialization'})};
const stable=(v:unknown):string=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
const keys=(v:any,n:string[])=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===n.sort().join(',');
const hash=async(b:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(b).buffer)),x=>x.toString(16).padStart(2,'0')).join('');
export type DerivedInputProjection={bookRender:unknown;engine:{extensionPath:string;path:string;sha256:string;descriptor:{path:string;sha256:string};contribution:{path:string}}};
function contribution(source:any){
 const entries=(source.extensions??[]).flatMap((e:any)=>(e.contributes?.engines??[]).map((engine:any)=>({extension:e,engine})));
 if(entries.length!==1)fail('Нужен ровно один verified native engine contribution');
 const {extension,engine}=entries[0];
 if(!keys(engine,['path'])||typeof engine.path!=='string'||extension.id?.name!=='julia-engine'||typeof extension.path!=='string'||basename(extension.path)!=='julia-engine'||engine.path!==join(extension.path,'julia-engine.js'))fail('Неизвестный automatic engine contribution');
 if(!Array.isArray(source.config?.engines)||!source.config.engines.length||stable(source.config.engines.at(-1))!==stable(engine))fail('Нет exact native engine suffix');
 return {extension,engine};
}
export async function deriveExecutionConfig(source:any,owned:any){
 if(source.config?.project?.type!=='book'||!source.config.book||!Array.isArray(source.config.book.render)||!Array.isArray(source.files?.config))fail('Нет validated native book source config');
 if(!keys(owned?.project,['type','render','output-dir','pre-render','post-render'])||owned.project.type!=='default'||!Array.isArray(owned.project.render)||!owned.project.render.length||typeof owned.project['pre-render']!=='string'||typeof owned.project['post-render']!=='string')fail('Нет fixed owned project overrides');
 const {extension,engine}=contribution(source);
 if(await Deno.realPath(extension.path)!==extension.path||await Deno.realPath(engine.path)!==engine.path||dirname(engine.path)!==extension.path)fail('Engine path не installed regular native contribution');
 const engineBytes=await metadataBytes(engine.path);if(!engineBytes)fail('Нет installed native engine bytes');
 const descriptors=[];for(const name of ['_extension.yml','_extension.yaml']){const path=join(extension.path,name),bytes=await metadataBytes(path);if(bytes)descriptors.push({path,sha256:await hash(bytes!)})}
 if(descriptors.length!==1)fail('Неоднозначный native engine descriptor');
 const config=structuredClone(source.config),bookRender=structuredClone(config.book.render);delete config.book.render;
 // Удаляется ОДИН доказанный native suffix. Идентичный authored prefix остаётся.
 config.engines=config.engines.slice(0,-1);Object.assign(config.project,structuredClone(owned.project));
 const projection:DerivedInputProjection={bookRender,engine:{extensionPath:extension.path,path:engine.path,sha256:await hash(engineBytes!),descriptor:descriptors[0],contribution:structuredClone(engine)}};
 return {config,projection};
}
/** Проверка effective native values; derived JSON сам по себе не доказывает round-trip. */
export function assertExecutionMetadata(source:any,execution:any,owned:any,projection:DerivedInputProjection){
 const {extension,engine}=contribution(source);
 if(stable(projection.bookRender)!==stable(source.config.book.render)||projection.engine.extensionPath!==extension.path||projection.engine.path!==engine.path||stable(projection.engine.contribution)!==stable(engine)||execution.dir!==source.dir||execution.quarto?.version!==source.quarto?.version)fail('Чужая source/execution projection');
 const expected=structuredClone(source.config);delete expected.book.render;
 Object.assign(expected.project,structuredClone(owned.project));
 // Stock нормализует owned script scalar/output path. Никаких nonowned project exceptions.
 const project=execution.config?.project;
 const comparable=(v:any)=>{const p=structuredClone(v);for(const k of ['type','render','output-dir','pre-render','post-render'])delete p[k];return p};
 if(!project||stable(comparable(source.config.project))!==stable(comparable(project))||project.type!=='default'||stable(project.render)!==stable(owned.project.render)||stable(project['pre-render'])!==stable([owned.project['pre-render']])||stable(project['post-render'])!==stable([owned.project['post-render']]))fail('Execution project metadata/singleton mismatch');
 // output-dir может быть native owner-relative spelling только того же exact пути.
 const output=owned.project['output-dir'];if(typeof project['output-dir']!=='string'||resolve(source.dir,project['output-dir'])!==resolve(source.dir,output))fail('Execution output не current owned directory');
 const actual=structuredClone(execution.config);delete actual.project;delete expected.project;
 expected.course={...expected.course,...owned.course};expected['course-export-context']=true;
 if(!expected.format||typeof expected.format!=='object'||Array.isArray(expected.format))fail('Не установлен native source format map');
 if(!Object.hasOwn(expected.format,'json')||expected.format.json==='default')expected.format.json={};
 if(expected.filters!==undefined&&(!Array.isArray(expected.filters)||expected.filters.some((f:any)=>typeof f!=='string')))fail('Неподдержанный native filter shape в owned projection');
 expected.filters=[...new Set([...(expected.filters??[]),...owned.filters])];
 expected.crossref=expected.crossref??{};
 if(stable(actual)!==stable(expected))fail('Execution nonowned metadata/native engines drift');
}
