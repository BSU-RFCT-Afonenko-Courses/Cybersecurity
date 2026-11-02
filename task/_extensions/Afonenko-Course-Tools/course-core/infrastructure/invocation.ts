// Точный вызванный native инструмент: общий lifecycle helper, без старого Course/overlay графа.
import { resolve } from "stdlib/path";
import { diagnostic } from "../domain/diagnostics.ts";
import { quartoExecutable } from "./process.ts";
const fail = (message: string): never => { throw diagnostic("CONTEXT_CHANGED", message); };
const stable = (value: unknown): string => JSON.stringify(value, (_k, v) => v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
async function digest(bytes: Uint8Array) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer)), x => x.toString(16).padStart(2, "0")).join(""); }
export async function invocationIdentity(root:string,content=true){
 const requested=quartoExecutable(),environment=stable(Deno.env.toObject());let path:string|undefined;
 if(requested.includes('/')||requested.includes('\\'))path=resolve(root,requested);
 else for(const dir of (Deno.env.get('PATH')||'').split(Deno.build.os==='windows'?';':':')){const candidate=resolve(root,dir||'.',requested);try{if((await Deno.stat(candidate)).isFile){path=candidate;break}}catch(e){if(!(e instanceof Deno.errors.NotFound))throw e}}
 if(!path)fail('Не разрешён stock executable');
 const lexical=await Deno.lstat(path!),physical=await Deno.realPath(path!),info=await Deno.lstat(physical);
 if(!info.isFile||info.isSymlink)fail('Stock executable не regular');
 return stable({requested,path,physical,link:lexical.isSymlink?await Deno.readLink(path!):null,identity:{dev:info.dev,ino:info.ino,mode:info.mode,size:info.size,mtime:info.mtime?.getTime(),ctime:info.ctime?.getTime()},...(content?{hash:await digest(await Deno.readFile(physical))}:{}),environment:await digest(new TextEncoder().encode(environment)),cwd:Deno.cwd(),profiles:Deno.env.get('QUARTO_PROFILE')});
}
