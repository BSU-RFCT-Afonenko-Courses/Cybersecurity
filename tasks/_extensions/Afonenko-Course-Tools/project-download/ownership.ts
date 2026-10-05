import { dirname, relative, resolve } from "stdlib/path";
import type { Request } from "./application/publish.ts";
import { RESOURCE_ID } from "./domain/config.ts";
import { child, exists, noSymlinks } from "./infrastructure/files.ts";

/** Снимок временных заявок после завершения нативного рендера. */
export interface OwnedRequestState {
  protocol:1;
  root:string;
  directory:string;
  files:{path:string; source:string; resources:string[]; sha256:string}[];
}

async function hash(algorithm:"SHA-1"|"SHA-256",bytes:Uint8Array):Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest(algorithm,new Uint8Array(bytes))))
    .map(value=>value.toString(16).padStart(2,"0")).join("");
}

async function requestDirectory(root:string,sources:string[]):Promise<{directory:string;present:boolean}> {
  if(root!==resolve(root)) throw new Error("Корень заявок должен быть каноническим абсолютным путём");
  // lstat проверяет и dangling links; realPath не должен скрыть ссылку в корне/родителях.
  for(let current=root;;current=dirname(current)) {
    const info=await Deno.lstat(current);
    if(info.isSymlink || !info.isDirectory) throw new Error(`Недопустимый каталог в пути корня заявок: ${current}`);
    if(dirname(current)===current) break;
  }
  for(const source of sources) {
    if(relative(root,child(root,source))!==source) throw new Error(`Источник заявки должен быть каноническим относительным путём: ${source}`);
  }
  const directory=child(root,"_generated/project-download/requests");
  for(const path of [child(root,"_generated"),child(root,"_generated/project-download"),directory]) {
    if(!await exists(path)) return {directory,present:false};
    const info=await Deno.lstat(path);
    if(info.isSymlink || !info.isDirectory) throw new Error(`Недопустимый каталог заявок: ${path}`);
  }
  await noSymlinks(root,directory);
  return {directory,present:true};
}

/** Потребитель передаёт уже проверенные входные документы владельца. */
export async function inspectOwnedRequests(root:string,sources:string[]):Promise<OwnedRequestState> {
  const {directory,present}=await requestDirectory(root,sources);
  const state:OwnedRequestState={protocol:1,root,directory,files:[]};
  if(!present) return state;
  const allowed=new Set(sources);
  const entries=await Array.fromAsync(Deno.readDir(directory));
  entries.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
  for(const entry of entries) {
    const path=child(directory,entry.name),info=await Deno.lstat(path);
    if(info.isSymlink || !info.isFile || !/^[a-f0-9]{40}\.json$/.test(entry.name)) throw new Error(`Посторонний объект в области заявок: ${path}`);
    await noSymlinks(root,path);
    const bytes=await Deno.readFile(path);
    const value:unknown=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
    if(!value || typeof value!=="object" || Array.isArray(value)) throw new Error(`Повреждённая заявка: ${path}`);
    const fields=value as Record<string,unknown>;
    if(Object.keys(fields).some(key=>!["source","resources","courseProcessed"].includes(key)) || (Object.hasOwn(fields,"courseProcessed") && typeof fields.courseProcessed!=="boolean") || !Object.hasOwn(fields,"source") || !Object.hasOwn(fields,"resources") || typeof fields.source!=="string" || !allowed.has(fields.source) || !Array.isArray(fields.resources) || fields.resources.some(id=>typeof id!=="string" || !RESOURCE_ID.test(id))) throw new Error(`Недопустимые поля заявки: ${path}`);
    const request=value as Request;
    if(entry.name!==await hash("SHA-1",new TextEncoder().encode(request.source))+".json") throw new Error(`Имя заявки не соответствует источнику: ${path}`);
    state.files.push({path,source:request.source,resources:request.resources,sha256:await hash("SHA-256",bytes)});
  }
  return state;
}

/** Вызывать последовательно, когда нативный процесс уже завершился. */
export async function clearOwnedRequests(root:string,sources:string[]):Promise<void> {
  const state=await inspectOwnedRequests(root,sources);
  if(!await exists(state.directory)) return;
  for(const file of state.files) await Deno.remove(file.path);
  // Нерекурсивное удаление не затрагивает родителей и не удаляет новые чужие записи.
  await Deno.remove(state.directory);
}
