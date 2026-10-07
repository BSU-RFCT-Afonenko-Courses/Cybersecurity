import { diagnostic, externalFailure } from "../diagnostics.ts";
import { join, relative, resolve, isAbsolute } from "stdlib/path";
import { globToRegExp } from "stdlib/path";
import type { ArchiveEntry } from "../domain/zip.ts";
import { DEFAULT_EXCLUDES, type Resource } from "../domain/config.ts";
export async function exists(path: string): Promise<boolean> {
  try { await Deno.lstat(path); return true; } catch (e) { if (e instanceof Deno.errors.NotFound) return false; throw e; }
}
export function child(root: string, path: string): string {
  const value = resolve(root, path), rel = relative(root, value);
  if (!rel || rel === ".." || rel.startsWith("../") || rel.startsWith("..\\") || isAbsolute(rel)) throw diagnostic("DOWNLOAD.PATH_INVALID", `Путь выходит за пределы проекта: ${path}`, {source:path,field:"path",hint:"Выберите каталог внутри текущего проекта."});
  return value;
}
export async function noSymlinks(root: string, path: string): Promise<void> {
  const rel = relative(root, child(root, path)); let current = root;
  for (const name of rel.split(/[\\/]/)) {
    current = join(current, name);
    if ((await Deno.lstat(current)).isSymlink) throw diagnostic("DOWNLOAD.PATH_INVALID", `Символические ссылки в пути ресурса запрещены: ${current}`, {source:current,field:"path"});
  }
}
/** Git применяет правила игнорирования: вложенные файлы, отрицания и исключения каталогов. */
async function gitIgnored(root: string, paths: string[]): Promise<Set<string>> {
  if (!paths.length) return new Set();
  // Изолированный индекс не наследует .gitignore внешнего репозитория:
  // издатель может собирать копию внутри игнорируемого рабочего каталога.
  const gitDirectory=await Deno.makeTempDir({prefix:"project-download-git-"});
  try {
    let initialized: Deno.CommandOutput;
    try { initialized=await new Deno.Command("git",{args:["init","--bare","--quiet",gitDirectory],stdout:"piped",stderr:"piped"}).output(); } catch(cause) { if (!Object.values(Deno.errors).some(kind => cause instanceof kind)) throw cause; throw externalFailure("git",undefined,cause); }
    if(!initialized.success) throw externalFailure("git",initialized);
    if(initialized.stderr.length) await Deno.stderr.write(initialized.stderr);
    const excludesFile=join(gitDirectory,"empty-excludes");
    await Deno.writeTextFile(excludesFile,"");
    const names=paths.map(path=>relative(root,path).replaceAll("\\","/"));
    let process:Deno.ChildProcess;
    try { process=new Deno.Command("git",{args:["-c","core.excludesFile="+excludesFile,"--git-dir="+gitDirectory,"--work-tree="+root,"check-ignore","--no-index","-z","--stdin"],cwd:root,stdin:"piped",stdout:"piped",stderr:"piped"}).spawn(); } catch(cause) { if (!Object.values(Deno.errors).some(kind => cause instanceof kind)) throw cause; throw externalFailure("git",undefined,cause); }
    const writer=process.stdin.getWriter();
    let inputFailure:unknown;
    try { await writer.write(new TextEncoder().encode(names.join("\0")+"\0")); }
    catch(cause) { inputFailure=cause; }
    try { await writer.close(); } catch(cause) { inputFailure ??= cause; }
    // Получить собственный exit/потоки Git даже при раннем закрытии stdin.
    const result=await process.output();
    if(result.code>1) throw externalFailure("git",result,inputFailure);
    if(inputFailure!==undefined) {
      if(Object.values(Deno.errors).some(kind => inputFailure instanceof kind)) throw externalFailure("git",result,inputFailure);
      throw inputFailure;
    }
    if(result.stderr.length) await Deno.stderr.write(result.stderr);
    return new Set(new TextDecoder().decode(result.stdout).split("\0").filter(Boolean).map(path=>resolve(root,path)));
  } finally { await Deno.remove(gitDirectory,{recursive:true}); }
}
export async function resourceFiles(root: string, resource: Resource): Promise<ArchiveEntry[]> {
  const directory=child(root, resource.path.startsWith("/") ? resource.path.slice(1) : resource.path);
  await noSymlinks(root,directory);
  if (!(await Deno.stat(directory)).isDirectory) throw diagnostic("DOWNLOAD.PATH_INVALID", `Ресурс не является каталогом: ${resource.path}`, {source:resource.path,field:"path"});
  const include=(resource.include ?? ["**/*"]).map(pattern=>globToRegExp(pattern,{globstar:true}));
  const exclude=[...DEFAULT_EXCLUDES,...(resource.exclude??[])].map(pattern=>globToRegExp(pattern,{globstar:true}));
  const paths: {path:string;name:string}[]=[];
  const excluded=(name:string)=>exclude.some(pattern=>pattern.test(name));
  async function walk(current:string):Promise<void> {
    const children=Array.from(await Array.fromAsync(Deno.readDir(current))).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
    for (const entry of children) {
      const path=join(current,entry.name),name=relative(directory,path).replaceAll("\\","/");
      if (excluded(name) || (entry.isDirectory && excluded(name+"/"))) continue;
      if (entry.isSymlink) throw diagnostic("DOWNLOAD.PATH_INVALID", `Ресурс содержит символическую ссылку: ${path}`, {source:path,field:"path"});
      if (entry.isDirectory) await walk(path);
      else if(entry.isFile && include.some(pattern=>pattern.test(name))) paths.push({path,name});
    }
  }
  await walk(directory);
  const ignored = resource.gitignore === false ? new Set<string>() : await gitIgnored(root,paths.map(item=>item.path));
  const entries:ArchiveEntry[]=[];
  for(const item of paths) if(!ignored.has(item.path)) entries.push({name:item.name,bytes:await Deno.readFile(item.path)});
  if(!entries.length) throw diagnostic("DOWNLOAD.SELECTION_EMPTY", `Ресурс пуст после отбора файлов: ${resource.path}`, {source:resource.path,field:"include/exclude",hint:"Проверьте шаблоны отбора и .gitignore."});
  return entries;
}
