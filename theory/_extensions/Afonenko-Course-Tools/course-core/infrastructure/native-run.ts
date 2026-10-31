import {publishSelectedCommonPaths,readSelectedCommonPath,type SelectedCommonPathRef} from './common-path-selected.ts';
import {createMetrics as __createMetrics} from "../observability/bridge.ts";
const __metrics=__createMetrics("course-core");
import { diagnostic } from "../domain/diagnostics.ts";
import { isAbsolute, join, relative, resolve } from "stdlib/path";
import type {
  Adapter,
  AdapterFragment,
  DocumentResult,
} from "../domain/model.ts";
import { child, exists } from "./files.ts";
import {
  cleanHiddenResourceOutputs,
  normalizeResourceFacts,
  validateCapturedResources,
} from "./resources.ts";
import {produceCommonPathBinding,assertProducedCommonPathBinding,readCommonPathBinding,withCommonPathBinding,commonBindingPhase,validateCapturedCommon,stable} from "./common-path-binding.ts";
import {discoverOwnedConfigOverlay,readOverlayContext,assertOverlayCurrent,assertOverlayFinalOutputs,admitOverlayNativeWriter} from './owned-config-overlay.ts';
import {overlayReference,restorationReference,type OwnedConfigOverlay,type RestorationReference} from './owned-config-proof.ts';
import {validateCompletedExportScope} from './native-export-retirement.ts';
export interface NativeRunPointer {
  schema: "course-native-run-pointer-v2"|"course-native-run-pointer-v3";
  ownedConfigOverlay?:OwnedConfigOverlay;overlayState?:"active"|"restored";ownedConfigRestoration?:RestorationReference;
  directory: string;
  projectRoot: string;
  profiles: string[];
  outputDirectory: string;
  initialInputFiles?: string[];
  renderAll: boolean;
  configurationHashes: Record<string,string|false>;
  commonPathBinding: {file:"common-files-path-binding.json";sha1:string;sha256:string};
  commonPathDocuments?:SelectedCommonPathRef[];
  commonPathRetirement?: {profile:string;file:string;sha1:string;sha256:string};
}
export interface NativeRun {
  schema: "course-native-run-v1";
  renderAll: boolean;
  projectRoot: string;
  outputDirectory: string;
  profiles: string[];
  documents: DocumentResult[];
  adapters: Adapter[];
  outputFiles: string[];
  inputFiles: string[];
}
export interface NativeRunExpectation {
  profiles?: string[];
  view?: "student" | "full";
  outputDirectory?: string;
}
const base = (root: string) => join(root, "_generated/course-spec");
const read = async (path: string) => JSON.parse(await Deno.readTextFile(path));
const profiles = () =>
  (Deno.env.get("QUARTO_PROFILE") || "").split(/[, ]+/).filter(Boolean);
async function contained(root: string, path: string) {
  const real = await Deno.realPath(path);
  if (real !== root) child(root, real);
  return real;
}
async function configurationHashes(root:string,activeProfiles:string[]):Promise<Record<string,string|false>>{
  const names=["_quarto.yml","_quarto.yaml",...activeProfiles.flatMap(profile=>["_quarto-"+profile+".yml","_quarto-"+profile+".yaml"])];
  const hashes:Record<string,string|false>={};
  for(const name of names){
    try{
      const bytes=await Deno.readFile(child(root,name));
      const digest=await crypto.subtle.digest("SHA-1",bytes);
      hashes[name]=Array.from(new Uint8Array(digest)).map(byte=>byte.toString(16).padStart(2,"0")).join("");
    }catch(error){if(error instanceof Deno.errors.NotFound)hashes[name]=false;else throw error;}
  }
  return hashes;
}
async function readPointer(root:string):Promise<NativeRunPointer>{
  const p = await read(join(base(root), "active-native-run.json"));
  if (!["course-native-run-pointer-v2","course-native-run-pointer-v3"].includes(p.schema) || p.projectRoot !== root) {
    throw diagnostic("NATIVE.RUN_POINTER_INVALID", "Указатель текущей native-сборки некорректен", {source: root, field: "native-run"});
  }
  if(Object.keys(p).some(k=>!['schema','directory','projectRoot','profiles','outputDirectory','initialInputFiles','renderAll','configurationHashes','commonPathBinding','commonPathDocuments','commonPathRetirement',...(p.schema==='course-native-run-pointer-v3'?['ownedConfigOverlay','overlayState','ownedConfigRestoration']:[])].includes(k))||!Array.isArray(p.profiles)||p.profiles.some((x:unknown)=>typeof x!=='string'||!/^[-a-zA-Z0-9_]+$/.test(x))||typeof p.renderAll!=='boolean')throw diagnostic('NATIVE.RUN_POINTER_INVALID','Некорректная private pointer schema',{source:root,field:'native-run'});
  child(join(base(root), "native-runs"), p.directory);
  await contained(root, p.directory);
  const current=Array.isArray(p.profiles)?await configurationHashes(root,p.profiles):{};let expected=p.configurationHashes;
  if(p.schema==='course-native-run-pointer-v3'){overlayReference(p.ownedConfigOverlay);if(p.commonPathRetirement||!['active','restored'].includes(p.overlayState))throw diagnostic('NATIVE.RUN_POINTER_INVALID','Нет closed overlay state',{source:root,field:'native-run'});const ctx=await readOverlayContext(p);if(p.configurationHashes[ctx.base.file]!==ctx.execution.hashes.sha1||p.configurationHashes[ctx.profile.file]!==ctx.profile.hashes.sha1)throw diagnostic('NATIVE.RUN_POINTER_INVALID','Overlay config hash pair mismatch',{source:root,field:'native-run'});if(p.overlayState==='restored'){restorationReference(p.ownedConfigRestoration);expected={...p.configurationHashes,[ctx.base.file]:ctx.base.hashes.sha1,[ctx.profile.file]:false}}else if(p.ownedConfigRestoration!==undefined)throw diagnostic('NATIVE.RUN_POINTER_INVALID','Active restoration ref forbidden',{source:root,field:'native-run'})}

  if(!Array.isArray(p.profiles) || !p.configurationHashes || Object.keys(current).length!==Object.keys(expected).length || Object.entries(current).some(([name,hash])=>expected[name]!==hash)) {
    throw diagnostic("NATIVE.RUN_NOT_CURRENT","Нативная конфигурация изменилась после начала запуска",{source:root,field:"native-run"});
  }
  return p;
}
type NativeOperation={pointer:NativeRunPointer;witness:Awaited<ReturnType<typeof readCommonPathBinding>>;check:()=>Promise<void>;owner:()=>any;publish:((()=>Promise<void>)[]);validate:((()=>Promise<void>)[]);completed:Map<string,{value:any;identity:string}>;captured:WeakSet<NativeRun>};
const activeRuns=new WeakMap<NativeRun,NativeOperation>(),operationOwners=new Set<string>();
async function withNativeOperation<T>(root:string,use:(op:NativeOperation)=>Promise<T>):Promise<T>{
 if(operationOwners.has(root))throw diagnostic('NATIVE.RUN_NOT_CURRENT','Reentrant native operation',{source:root,field:'native-run'});
 operationOwners.add(root);try{
 const p=await readPointer(root),identity=stable(p),publish:(()=>Promise<void>)[]=[],validate:(()=>Promise<void>)[]=[];
 return await withCommonPathBinding(p,async(w,check,owner)=>{
  const guard=async()=>{await check();if(stable(await read(join(base(root),'active-native-run.json')))!==identity)throw diagnostic('NATIVE.RUN_NOT_CURRENT','Native pointer/config changed during operation',{source:root,field:'native-run'})};
  const op:NativeOperation={pointer:p,witness:w,check:guard,owner,publish,validate,completed:new Map(),captured:new WeakSet()};await guard();const result=await use(op);await guard();validate.unshift(async()=>{for(const [path,state] of op.completed)if(stable(await read(path))!==state.identity)throw diagnostic('NATIVE.RUN_NOT_CURRENT','Completed NativeRun changed at final boundary',{source:root,field:'native-run'})});return result;
 },async()=>{for(const commit of publish)await commit()},async()=>{for(const check of validate)await check()});
 }finally{operationOwners.delete(root)}
}
async function validatedPointer(root:string){return await withNativeOperation(root,async op=>({pointer:op.pointer,witness:op.witness}))}
async function pointer(root:string):Promise<NativeRunPointer>{return (await validatedPointer(root)).pointer}
/** Внутреннее batch lifetime; run не переносит capability за границу callback. */
export async function withLoadedNativeRun<T>(projectRoot:string,expectation:NativeRunExpectation,use:(run:NativeRun)=>Promise<T>):Promise<T>{
 const root=await Deno.realPath(projectRoot);
 return await withNativeOperation(root,async op=>{
  const run=await loadNativeRunUsing(root,expectation,op),identity=nativeRunIdentity(run);activeRuns.set(run,op);
  try{const result=await use(run);await op.check();if(nativeRunIdentity(run)!==identity)throw diagnostic('NATIVE.RUN_NOT_CURRENT','Batch NativeRun changed',{source:root,field:'native-run'});return result}finally{activeRuns.delete(run)}
 });
}
function nativeRunIdentity(run:NativeRun){return stable({...run,adapters:run.adapters.map(a=>({...a,fragments:[...a.fragments]}))})}
export async function withNativeRunProof<T>(run:NativeRun,use:()=>Promise<T>):Promise<T>{
 const active=activeRuns.get(run);if(active){await assertCommonPathRunUsing(run,active);return await use()}
 const root=await Deno.realPath(run.projectRoot);return await withNativeOperation(root,async op=>{
  await assertCommonPathRunUsing(run,op);const identity=nativeRunIdentity(run);activeRuns.set(run,op);
  try{const result=await use();if(nativeRunIdentity(run)!==identity)throw diagnostic('NATIVE.RUN_NOT_CURRENT','NativeRun changed in artifact operation',{source:root,field:'native-run'});return result}finally{activeRuns.delete(run)}
 });
}
export async function publishNativeMaterialization(run:NativeRun,publish:()=>Promise<void>){
 const op=activeRuns.get(run);if(!op)throw diagnostic('NATIVE.RUN_NOT_CURRENT','No active native materialization',{source:run.projectRoot,field:'native-run'});await op.check();op.publish.push(publish);
}
export async function nativeRunSiteUrl(run:NativeRun):Promise<string|undefined>{
 const op=activeRuns.get(run);if(!op)throw diagnostic('NATIVE.RUN_NOT_CURRENT','Expired native artifact batch',{source:run.projectRoot,field:'native-run'});await op.check();return op.owner()?.config?.website?.['site-url'];
}
async function list(root: string, key: string) {
  const mode = Deno.env.get(
    key.replace("QUARTO_PROJECT_", "QUARTO_USE_FILE_FOR_PROJECT_"),
  );
  const content = mode
    ? await Deno.readTextFile(mode)
    : Deno.env.get(key) || "";
  const values = content.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  return [...new Set(values.map((path) => resolve(root, path)))];
}
export async function currentNativeOutputs(
  projectRoot: string,
): Promise<string[]> {
  return await list(projectRoot, "QUARTO_PROJECT_OUTPUT_FILES");
}
export async function beginNativeRun(
  projectRoot: string,
): Promise<NativeRunPointer> {
  const root = await Deno.realPath(projectRoot),
    outputDirectory = resolve(
      root,
      Deno.env.get("QUARTO_PROJECT_OUTPUT_DIR") || ".",
    );
  if (outputDirectory !== root) child(root, outputDirectory);
  await Deno.mkdir(base(root), { recursive: true });
  await contained(root, base(root));
  const overlay=await discoverOwnedConfigOverlay(root,profiles(),outputDirectory);
  for (
    const name of ["active-native-run.json", "native-run.json", "course.json", "course-candidate.json"]
  ) {
    const path = join(base(root), name);
    if (await exists(path)) await Deno.remove(path);
  }
  const runs = join(base(root), "native-runs");
  await Deno.mkdir(runs, { recursive: true });
  await contained(root, runs);
  if (await exists(outputDirectory)) await contained(root, outputDirectory);
  const directory = overlay?.directory??join(runs, crypto.randomUUID());
  await Deno.mkdir(join(directory, "documents"), { recursive: true });
  await Deno.mkdir(join(directory, "adapters"));
  if(overlay)await Deno.mkdir(join(directory,'native-json-intents'),{mode:0o700});
  const p = {
    schema: overlay?"course-native-run-pointer-v3":"course-native-run-pointer-v2",
    ...(overlay?{ownedConfigOverlay:overlay.ownedConfigOverlay,overlayState:"active" as const}:{}),
    projectRoot: root,
    directory,
    profiles: profiles(),
    outputDirectory,
    initialInputFiles: await list(root, "QUARTO_PROJECT_INPUT_FILES"),
    renderAll: Deno.env.get("QUARTO_PROJECT_RENDER_ALL") === "1",
    configurationHashes:await configurationHashes(root,profiles()),
  } as NativeRunPointer;
  p.commonPathBinding=await produceCommonPathBinding(p);
  const witness=await assertProducedCommonPathBinding(p);
  p.commonPathDocuments=await publishSelectedCommonPaths(p,witness);
  await assertProducedCommonPathBinding(p);
  await Deno.writeTextFile(
    join(base(root), "active-native-run.json"),
    JSON.stringify(p),{mode:0o600},
  );
  return p;
}
async function finishNativeRunUsing(root:string,op:NativeOperation):Promise<NativeRun>{
  const p=op.pointer;
  const complete = join(base(root), "native-run.json");
  if (await exists(complete)) await Deno.remove(complete);
  if (JSON.stringify(p.profiles) !== JSON.stringify(profiles())) {
    throw diagnostic("NATIVE.PROFILES_CHANGED", "Профили изменились во время сборки", {source: root, field: "native-run"});
  }
  const outputFiles = await currentNativeOutputs(root);
  if (!outputFiles.length) throw diagnostic("NATIVE.NO_CURRENT_OUTPUTS", "У сборки нет текущих выходных файлов", {source: root, field: "native-run"});
  for (const path of outputFiles) {
    if (path !== p.outputDirectory) child(p.outputDirectory, path);
    await contained(root, path);
    if (!(await Deno.stat(path)).isFile) {
      throw diagnostic("NATIVE.OUTPUT_NOT_FILE", "Выходной путь не является файлом: " + path, {source: root, field: "native-run"});
    }
  }
  await assertOverlayFinalOutputs(p,outputFiles);
  const documents: DocumentResult[] = [];
  const intermediateOutputs = new Map<string, string>();
  for await (const e of Deno.readDir(join(p.directory, "documents"))) {
    if (!e.isFile || !e.name.endsWith(".json")) continue;
    const d: DocumentResult = await read(
      join(p.directory, "documents", e.name),
    );
    if (
      d.scope !== "document" || d.source !== d.document?.source ||
      JSON.stringify(d.document.profiles) !== JSON.stringify(p.profiles)
    ) throw diagnostic("NATIVE.DOCUMENT_INVALID", "Контекст входного документа не соответствует текущей сборке", {source: d.source, field: "document"});
    const input = child(root, d.source);
    let out = resolve(p.outputDirectory, d.document.output);
    // Quarto's JSON writer reports an authored output-file beside the input
    // before project relocation. Accept only its exact relocated file from
    // this run's native inventory, never a guessed or previously saved output.
    if (d.document.exportContext === true && d.document.format === "json" && !outputFiles.includes(out)) {
      child(root, out);
      const relocated = child(p.outputDirectory, relative(root, out));
      if (outputFiles.includes(relocated)) {
        intermediateOutputs.set(d.source + "\0" + d.document.format, d.document.output);
        d.document.output = relative(p.outputDirectory, relocated).replaceAll("\\", "/");
        out = relocated;
      }
    }
    child(p.outputDirectory, out);
    await contained(root, input);
    // Pandoc reports the native LaTeX intermediate before Quarto builds the PDF.
    // Bind only its exact final stem present in this process's public inventory.
    if (
      !outputFiles.includes(out) && d.document.format === "latex" &&
      /\.tex$/i.test(out)
    ) {
      const pdf = out.replace(/\.tex$/i, ".pdf");
      if (outputFiles.includes(pdf)) {
        intermediateOutputs.set(
          d.source + "\0" + d.document.format,
          d.document.output,
        );
        d.document.output = relative(p.outputDirectory, pdf).replaceAll(
          "\\",
          "/",
        );
        out = pdf;
      }
    }
    if (!outputFiles.includes(out)) {
      throw diagnostic("NATIVE.DOCUMENT_NOT_CURRENT", "Документ не связан с текущим выходным файлом: " + d.source, {source: d.source, field: "document"});
    }
    if (d.document.exportContext === true && d.document.format === "json" && documents.some(existing => resolve(p.outputDirectory, existing.document.output) === out)) {
      throw diagnostic("NATIVE.DUPLICATE_OUTPUT", "Несколько исходных документов используют один выходной файл: " + d.document.output, {source: d.source, field: "output-file"});
    }
    if (
      documents.some((x) =>
        x.source === d.source && x.document.format === d.document.format
      )
    ) throw diagnostic("NATIVE.DUPLICATE_DOCUMENT", "Повторный документ одного формата", {source: d.source, field: "document"});
    if (d.resources) {
      d.resources = normalizeResourceFacts(d.resources);
      if (
        d.resources.source !== d.source ||
        resolve(d.resources.outputDirectory) !== p.outputDirectory
      ) {
        throw diagnostic("NATIVE.RESOURCE_CONTEXT_INVALID", "Ресурс относится к другому документу или выходному каталогу", {source: d.source, field: "document"});
      }
      for (const file of d.resources.capturedFiles || []) {
        if (file.capture) {
          await contained(p.directory, child(p.directory, file.capture));
        }
      }
      await validateCapturedResources(root, d.resources);
    }
    documents.push(d);
  }
  if (documents.length) {
    for (const output of outputFiles) {
      if (
        /\.html?$/i.test(output) &&
        !documents.some((d) =>
          resolve(p.outputDirectory, d.document.output) === output
        )
      ) throw diagnostic("NATIVE.MISSING_DOCUMENT", "Для текущего HTML не найден результат Core: " + output, {source: root, field: "native-run"});
    }
  }
  await cleanHiddenResourceOutputs(
    root,
    documents.flatMap((d) => d.resources ? [d.resources] : []),
  );
  const inputFiles = documents.length
    ? documents.map((d) => resolve(root, d.source))
    : p.initialInputFiles || [];
  const adapters: Adapter[] = [];
  for await (const e of Deno.readDir(join(p.directory, "adapters"))) {
    if (!e.isDirectory) continue;
    const dir = join(p.directory, "adapters", e.name),
      c = await read(join(dir, "contract.json"));
    if (
      c.name !== e.name || typeof c.rules !== "string" ||
      typeof c.directory !== "string"
    ) throw diagnostic("NATIVE.ADAPTER_CONTRACT_INVALID", "Некорректный контракт установленного адаптера", {source: root, field: "native-run"});
    child(c.directory, c.rules);
    await contained(root, c.directory);
    const fragments = new Map<string, AdapterFragment>();
    for await (const f of Deno.readDir(dir)) {
      if (
        !f.isFile || f.name === "contract.json" || !f.name.endsWith(".json")
      ) continue;
      const v = await read(join(dir, f.name));
      const d = documents.find((x) => x.source === v.source);
      if (
        d && intermediateOutputs.has(d.source + "\0" + d.document.format) &&
        v.document?.output ===
          intermediateOutputs.get(d.source + "\0" + d.document.format)
      ) {
        v.document.output = d.document.output;
      }
      if (
        !d || v.document?.source !== d.document.source ||
        v.document?.format !== d.document.format ||
        v.document?.output !== d.document.output ||
        JSON.stringify(v.document?.profiles) !==
          JSON.stringify(d.document.profiles) ||
        v.course?.id !== d.course.id || v.course?.view !== d.course.view ||
        v.adapter !== c.name || fragments.has(v.source)
      ) throw diagnostic("NATIVE.ADAPTER_NOT_CURRENT", "Фрагмент адаптера не относится к текущему документу", {source: v.source, id: c.name, field: "adapter"});
      fragments.set(v.source, v);
    }
    adapters.push({
      directory: c.directory,
      contract: { name: c.name, rules: c.rules },
      fragments,
    });
  }
  const run: NativeRun = {
    schema: "course-native-run-v1",
    renderAll: p.renderAll,
    projectRoot: root,
    outputDirectory: p.outputDirectory,
    profiles: p.profiles,
    documents,
    adapters,
    outputFiles,
    inputFiles,
  };
  return run;
}
async function completedRun<T>(projectRoot:string,use:(run:NativeRun)=>Promise<T>,persistDocuments:boolean){
 const root=await Deno.realPath(projectRoot);
 const result=await withNativeOperation(root,async op=>{
  const run=await finishNativeRunUsing(root,op);activeRuns.set(run,op);
  try{const result=await use(run);op.publish.push(await prepareNativeRunSave(run,persistDocuments,op));return {run,result}}finally{activeRuns.delete(run)}
 });
 return result;
}
export async function finishNativeRun(projectRoot:string):Promise<NativeRun>{return (await completedRun(projectRoot,async()=>{},false)).run}
export async function withFinishedNativeRun<T>(projectRoot:string,use:(run:NativeRun)=>Promise<T>):Promise<T>{return (await completedRun(projectRoot,use,true)).result}
export async function saveNativeRun(run:NativeRun,persistDocuments=false){
 const active=activeRuns.get(run);
 if(active)throw diagnostic('NATIVE.RUN_NOT_CURRENT','Native completion owns its final save',{source:run.projectRoot,field:'native-run'});
 const root=await Deno.realPath(run.projectRoot);await withNativeOperation(root,async op=>{op.publish.push(await prepareNativeRunSave(run,persistDocuments,op))});
}
async function prepareNativeRunSave(run:NativeRun,persistDocuments:boolean,op:NativeOperation){
  const root=await Deno.realPath(run.projectRoot),p=op.pointer;await op.check();
  for(const doc of persistDocuments?run.documents:[]){
    const digest=await crypto.subtle.digest("SHA-1",new TextEncoder().encode(doc.source+"\0"+doc.document.format));
    const filename=Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("")+".json";
    const encoded=JSON.stringify(doc);
    for await(const entry of Deno.readDir(join(p.directory,"documents"))){
      if(!entry.isFile||!entry.name.endsWith(".json"))continue;
      const current=await read(join(p.directory,"documents",entry.name));
      if(current.source===doc.source&&current.document?.format===doc.document.format)await Deno.writeTextFile(join(p.directory,"documents",entry.name),encoded);
    }
    const directory=join(base(root),"documents",doc.course.view??"default");
    await Deno.mkdir(directory,{recursive:true});
    await Deno.writeTextFile(join(directory,filename),encoded);
  }
  await assertOverlayFinalOutputs(p,run.outputFiles);
  const witness=op.witness;await validateCapturedCommon(run,witness);
  const serialized=JSON.stringify({...run,directory:p.directory,adapters:run.adapters.map(a=>({...a,fragments:[...a.fragments.values()]}))});
  return async()=>{
  if(stable(await readPointer(root))!==stable(p))throw diagnostic("NATIVE.RUN_NOT_CURRENT","Pointer changed before native publication",{source:root,field:"native-run"});
  await Deno.writeTextFile(join(p.directory,"native-run.json"),serialized,p.schema==='course-native-run-pointer-v3'?{mode:0o600}:{});
  await Deno.writeTextFile(join(base(root),"native-run.json"),serialized,p.schema==='course-native-run-pointer-v3'?{mode:0o600}:{});
  if(witness.forcedWriter){try{await validateCompletedExportScope(p,witness,commonBindingPhase(witness),true)}catch(e){
   for(const file of [join(p.directory,'native-run.json'),join(base(root),'native-run.json')]){try{if(await Deno.readTextFile(file)===serialized)await Deno.remove(file)}catch{}}throw e;
  }}
  };
}
/** Rebind only the exporter-owned temporary profile's planned removal. */
export async function prepareNativeExportCleanup(projectRoot:string,profile:string){
  const root=await Deno.realPath(projectRoot);
  const {p,owned}=await withNativeOperation(root,async op=>{
  const p=op.pointer,run=await read(join(p.directory,"native-run.json"));
  if(run.directory!==p.directory || !run.documents?.length || !run.documents.every((doc:DocumentResult)=>doc.document.exportContext===true) || !p.profiles.includes(profile)) {
    throw diagnostic("NATIVE.RUN_NOT_CURRENT","Нельзя завершить временную конфигурацию чужого запуска",{source:root,field:"native-run"});
  }
  const name="_quarto-"+profile+".yml";
  if(!(name in p.configurationHashes))throw diagnostic("NATIVE.RUN_NOT_CURRENT","Временный профиль отсутствует в текущем запуске",{source:root,field:"native-run"});
  const witness=op.witness,owned=witness.temporaryExportProfile;
  if(!owned||owned.profile!==profile||owned.file!==name||owned.sha1!==p.configurationHashes[name])throw diagnostic("NATIVE.RUN_NOT_CURRENT","Профиль не принадлежит generated export текущего запуска",{source:root,field:"native-run"});
  await validateCompletedExportScope(p,witness,commonBindingPhase(witness));return {p,owned};
  });
  if(stable(await readPointer(root))!==stable(p))throw diagnostic("NATIVE.RUN_NOT_CURRENT","Pointer changed before retirement",{source:root,field:"native-run"});
  p.commonPathRetirement=owned;
  p.configurationHashes[owned.file]=false;
  await Deno.writeTextFile(join(base(root),"active-native-run.json"),JSON.stringify(p));
}
export async function loadNativeRun(
  projectRoot: string,
  expectation: NativeRunExpectation = {},
): Promise<NativeRun> {
  return await withLoadedNativeRun(projectRoot,expectation,async run=>run);
}
async function completedSnapshot(op:NativeOperation,path:string){
 let state=op.completed.get(path);if(!state){const value=await read(path);state={value,identity:stable(value)};op.completed.set(path,state)}return state.value;
}
async function admitCapturedRun(run:NativeRun,op:NativeOperation){
 if(op.captured.has(run))return;
 await validateCapturedCommon(run,op.witness);if(op.witness.forcedWriter)await validateCompletedExportScope(op.pointer,op.witness,commonBindingPhase(op.witness));
 op.captured.add(run);op.validate.unshift(async()=>{await validateCapturedCommon(run,op.witness);if(op.witness.forcedWriter)await validateCompletedExportScope(op.pointer,op.witness,commonBindingPhase(op.witness),true)});
}
async function loadNativeRunUsing(root:string,expectation:NativeRunExpectation,op:NativeOperation):Promise<NativeRun>{
  const p=op.pointer,run=structuredClone(await completedSnapshot(op,join(base(root),"native-run.json")));
  if (
    run.schema !== "course-native-run-v1" || run.directory !== p.directory ||
    run.projectRoot !== root
  ) throw diagnostic("NATIVE.RUN_NOT_CURRENT", "Сохранённая native-сборка не является текущей", {source: root, field: "native-run"});
  if (
    expectation.profiles &&
      JSON.stringify(expectation.profiles) !== JSON.stringify(run.profiles) ||
    expectation.view &&
      run.documents.some((d: DocumentResult) =>
        d.course.view !== expectation.view
      ) ||
    expectation.outputDirectory &&
      resolve(root, expectation.outputDirectory) !== run.outputDirectory
  ) throw diagnostic("NATIVE.EXPECTATION_MISMATCH", "Native-сборка не соответствует выбранному профилю, представлению или каталогу", {source: root, field: "native-run"});
  await admitCapturedRun(run,op);
  delete run.ownedConfigRestoration;
  run.adapters = run.adapters.map((a: any) => ({
    ...a,
    fragments: new Map(a.fragments.map((f: AdapterFragment) => [f.source, f])),
  }));
  await assertCommonPathRunUsing(run,op);return run;
}

/** Внутренний мост Lua, связанный с текущим pointer, без caller override. */
export async function commonPathDocument(root:string,source:string,format:string){
 return await __metrics.wrapAsync({id:"course-core.infrastructure.native-run.commonPathDocument",kind:"io",document_id:source},async()=>{
 root=await Deno.realPath(root);const p=await readPointer(root);
 if(p.commonPathDocuments!==undefined&&!p.commonPathRetirement&&(p.schema!=='course-native-run-pointer-v3'||p.overlayState==='active'))return await readSelectedCommonPath(p,source,format);
 const {witness:w}=await validatedPointer(root);
 const rows=w.documents.filter(d=>d.source===source&&d.format===format);
 if(rows.length!==1)throw diagnostic('NATIVE.COMMON_PATH_BINDING_INVALID','Неизвестный source/format текущего witness',{source,field:'native-run'});
 return rows[0];
 })();
}
/** Private actual Lua writer boundary; no caller override to public read-only API. */
export async function bindNativeJsonDocument(root:string,source:string,format:string,writer:string,documentOutput:string){
 root=await Deno.realPath(root);const p=await readPointer(root),identity=stable(p);
 const selectedCheck=async()=>{if(stable(await readPointer(root))!==identity)throw diagnostic('NATIVE.RUN_NOT_CURRENT','Pointer изменён во время native writer admission',{source,field:'native-run'});return await commonPathDocument(root,source,format)};
 const row=await selectedCheck();await admitOverlayNativeWriter(p,source,format,writer,documentOutput,selectedCheck);await selectedCheck();return row;
}
/** Произвольный retained NativeRun не разрешает materialization общих файлов. */
export async function assertCommonPathRun(run:NativeRun){
 const active=activeRuns.get(run);if(active)return await assertCommonPathRunUsing(run,active);
 const root=await Deno.realPath(run.projectRoot);return await withNativeOperation(root,op=>assertCommonPathRunUsing(run,op));
}
async function assertCommonPathRunUsing(run:NativeRun,op:NativeOperation){
 await op.check();const p=op.pointer,w=op.witness,root=run.projectRoot;if(activeRuns.get(run)===op&&op.captured.has(run))return w;
 const current=await completedSnapshot(op,join(p.directory,'native-run.json'));
 if(current.projectRoot!==run.projectRoot||current.outputDirectory!==run.outputDirectory||current.renderAll!==run.renderAll||stable(current.profiles)!==stable(run.profiles)||stable(current.documents)!==stable(run.documents)||stable(current.inputFiles)!==stable(run.inputFiles)||stable(current.outputFiles)!==stable(run.outputFiles))throw diagnostic('NATIVE.RUN_NOT_CURRENT','NativeRun не совпадает с текущим captured proof',{source:root,field:'native-run'});
 await admitCapturedRun(run,op);await op.check();return w;
}

// @ts-expect-error JS допускает замену function binding; сигнатура публичного API сохраняется.
currentNativeOutputs=__metrics.wrapAsync({id:"course-core.infrastructure.native-run.currentNativeOutputs",kind:"io"},currentNativeOutputs);
// @ts-expect-error JS допускает замену function binding; сигнатура публичного API сохраняется.
beginNativeRun=__metrics.wrapAsync({id:"course-core.infrastructure.native-run.beginNativeRun",kind:"io"},beginNativeRun);
// @ts-expect-error JS допускает замену function binding; сигнатура публичного API сохраняется.
finishNativeRun=__metrics.wrapAsync({id:"course-core.infrastructure.native-run.finishNativeRun",kind:"io"},finishNativeRun);
// @ts-expect-error JS допускает замену function binding; сигнатура публичного API сохраняется.
saveNativeRun=__metrics.wrapAsync({id:"course-core.infrastructure.native-run.saveNativeRun",kind:"io"},saveNativeRun);
// @ts-expect-error JS допускает замену function binding; сигнатура публичного API сохраняется.
prepareNativeExportCleanup=__metrics.wrapAsync({id:"course-core.infrastructure.native-run.prepareNativeExportCleanup",kind:"io"},prepareNativeExportCleanup);
// @ts-expect-error JS допускает замену function binding; сигнатура публичного API сохраняется.
loadNativeRun=__metrics.wrapAsync({id:"course-core.infrastructure.native-run.loadNativeRun",kind:"io"},loadNativeRun);
// @ts-expect-error JS допускает замену function binding; generic callback API сохраняется.
withLoadedNativeRun=__metrics.wrapAsync({id:"course-core.infrastructure.native-run.withLoadedNativeRun",kind:"phase"},withLoadedNativeRun);
// @ts-expect-error JS допускает замену function binding; generic callback API сохраняется.
withFinishedNativeRun=__metrics.wrapAsync({id:"course-core.infrastructure.native-run.withFinishedNativeRun",kind:"phase"},withFinishedNativeRun);
// @ts-expect-error JS допускает замену function binding; generic callback API сохраняется.
withNativeRunProof=__metrics.wrapAsync({id:"course-core.infrastructure.native-run.withNativeRunProof",kind:"phase"},withNativeRunProof);

/** Producer-only completed execution → restored descriptor transition. No legacy token. */
export async function prepareOverlayNativeCleanup(projectRoot:string,profile:string){
 const root=await Deno.realPath(projectRoot);
 const {p,ctx,pointerPath,pointerBytes,paths,before}=await withNativeOperation(root,async op=>{
 const p=op.pointer;
 if(p.schema!=='course-native-run-pointer-v3'||p.overlayState!=='active'||p.profiles.length!==1||p.profiles[0]!==profile)throw diagnostic('NATIVE.RUN_NOT_CURRENT','Нет active owned overlay',{source:root,field:'native-run'});
 const witness=op.witness,ctx=await readOverlayContext(p);await validateCompletedExportScope(p,witness,commonBindingPhase(witness));
 const pointerPath=join(base(root),'active-native-run.json'),pointerBytes=await Deno.readTextFile(pointerPath),paths=[join(p.directory,'native-run.json'),join(base(root),'native-run.json')],before=await Promise.all(paths.map(path=>Deno.readTextFile(path)));
 if(before[0]!==before[1])throw diagnostic('NATIVE.RUN_NOT_CURRENT','Completed copies расходятся',{source:root,field:'native-run'});
 return {p,ctx,pointerPath,pointerBytes,paths,before};
 });
 let used=false;
 return async(restored:Awaited<ReturnType<Awaited<ReturnType<typeof import('./owned-config-overlay.ts')['startOwnedConfigOverlay']>>['restore']>>)=>{
  if(used)throw diagnostic('NATIVE.RUN_NOT_CURRENT','Restoration capability уже использована',{source:root,field:'native-run'});used=true;
  if(stable(restored.ctx)!==stable(ctx)||stable(restored.ref)!==stable(p.ownedConfigOverlay)||await Deno.readTextFile(pointerPath)!==pointerBytes||(await Promise.all(paths.map(path=>Deno.readTextFile(path)))).some((b,i)=>b!==before[i]))throw diagnostic('NATIVE.RUN_NOT_CURRENT','Execution/source proof изменён до завершения',{source:root,field:'native-run'});
  await restored.transaction.retire(join(p.directory,'owned-export-source-config.raw'));await restored.transaction.verifyRetired();
  const {validateRestorationRecord}=await import('./owned-config-proof.ts');
  const record=validateRestorationRecord({schema:'course-owned-export-restored-entry-v1',projectRoot:root,runDirectory:p.directory,file:ctx.base.file,sourceContext:overlayReference(p.ownedConfigOverlay).sourceContext,sourceConfig:ctx.base.hashes,executionConfig:ctx.execution.hashes,originalEntry:ctx.base.originalEntry,restoredEntry:restored.restoredEntry},{projectRoot:root,runDirectory:p.directory,file:ctx.base.file,sourceContext:overlayReference(p.ownedConfigOverlay).sourceContext,sourceConfig:ctx.base.hashes,executionConfig:ctx.execution.hashes,originalEntry:ctx.base.originalEntry});
  const {validateRestoredSourceBeforeCommit}=await import('./owned-config-overlay.ts');await validateRestoredSourceBeforeCommit(p,ctx,record.restoredEntry);
  const bytes=new TextEncoder().encode(JSON.stringify(record)),hex=async(alg:string)=>Array.from(new Uint8Array(await crypto.subtle.digest(alg,bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  const ref={file:'owned-export-restored-entry.json' as const,sha1:await hex('SHA-1'),sha256:await hex('SHA-256')};
  await Deno.writeFile(join(p.directory,ref.file),bytes,{createNew:true,mode:0o600});
  await restored.transaction.verifyRetired();
  if(await Deno.readTextFile(pointerPath)!==pointerBytes||(await Promise.all(paths.map(path=>Deno.readTextFile(path)))).some((b,i)=>b!==before[i]))throw diagnostic('NATIVE.RUN_NOT_CURRENT','Execution proof изменён перед final commit',{source:root,field:'native-run'});
  const completed=JSON.parse(before[0]);completed.ownedConfigRestoration=ref;const encoded=JSON.stringify(completed);
  for(const path of paths)await Deno.writeTextFile(path,encoded,{mode:0o600});
  const final:NativeRunPointer={...p,overlayState:'restored',ownedConfigRestoration:ref};await Deno.writeTextFile(pointerPath,JSON.stringify(final),{mode:0o600});
  await restored.transaction.verifyRetired();await assertOverlayCurrent(final,ctx);const finalWitness=await readCommonPathBinding(final);await validateCompletedExportScope(final,finalWitness);
 };
}
