import { join, relative, resolve } from "stdlib/path";
import { configuration, RESOURCE_ID, type Resource } from "../domain/config.ts";
import { publish, type Request } from "../application/publish.ts";
import { child, exists, noSymlinks, resourceFiles } from "./files.ts";
const manifestName=".project-download-manifest.json";
async function inspect(root:string) {
  const executable=Deno.env.get("QUARTO") || Deno.env.get("QUARTO_BIN_PATH") && join(Deno.env.get("QUARTO_BIN_PATH")!,"quarto") || "quarto";
  const result=await new Deno.Command(executable,{args:["inspect",root],cwd:root,stdout:"piped",stderr:"piped"}).output();
  if(!result.success) throw new Error(new TextDecoder().decode(result.stderr));
  return JSON.parse(new TextDecoder().decode(result.stdout));
}
function archiveName(name:string):boolean { return name.endsWith(".zip") && RESOURCE_ID.test(name.slice(0,-4)); }
export async function clearOwned(root:string,output:string):Promise<void> {
  const outputRoot=resolve(root,output);
  const directory=child(outputRoot,"_downloads");
  if(!await exists(directory)) return;
  if((await Deno.lstat(outputRoot)).isSymlink) throw new Error("Каталог вывода не должен быть символической ссылкой");
  await noSymlinks(outputRoot,directory);
  const manifest=join(directory,manifestName);
  if(!await exists(manifest)) return;
  await noSymlinks(outputRoot,manifest);
  const files=JSON.parse(await Deno.readTextFile(manifest));
  if(!Array.isArray(files) || files.some(name=>typeof name!=="string" || !archiveName(name))) throw new Error("Повреждён перечень файлов project-download");
  for(const name of files) { const path=join(directory,name); if(await exists(path)) { await noSymlinks(outputRoot,path); await Deno.remove(path); } }
  await Deno.remove(manifest);
}
export async function prepare(root:string):Promise<void> {
  const inspected=await inspect(root);
  configuration(inspected.config["project-download"]);
  const output=Deno.env.get("QUARTO_PROJECT_OUTPUT_DIR") || inspected.config.project?.["output-dir"] || ".";
  await clearOwned(root,output);
  const requests=child(root,"_generated/project-download/requests");
  if(await exists(requests)) { await noSymlinks(root,requests); await Deno.remove(requests,{recursive:true}); }
}
export async function finish(root:string):Promise<number> {
  const inspected=await inspect(root), config=configuration(inspected.config["project-download"]);
  const output=Deno.env.get("QUARTO_PROJECT_OUTPUT_DIR") || inspected.config.project?.["output-dir"] || ".";
  const selected=new Set<string>(inspected.files.input.map((path:string)=>relative(root,path).replaceAll("\\","/")));
  const profiles=(Deno.env.get("QUARTO_PROFILE") || "").split(",").filter(Boolean);
  let course:{exercises:{id:string;source:string;project:string}[]} | undefined;
  return await publish(config,profiles,{
    async requests(){
      const directory=join(root,"_generated/project-download/requests"), requests:Request[]=[];
      if(!await exists(directory)) return requests;
      for await(const entry of Deno.readDir(directory)) if(entry.isFile && entry.name.endsWith(".json")) {
        const request:Request=JSON.parse(await Deno.readTextFile(join(directory,entry.name)));
        if(selected.has(request.source)) requests.push(request);
      }
      return requests;
    },
    async courseResource(id,source):Promise<Resource> {
      course ??= JSON.parse(await Deno.readTextFile(join(root,"_generated/course-spec/course.json")));
      const exercise=course!.exercises.find(item=>item.id===id && item.source===source);
      if(!exercise?.project) throw new Error(`В проверенной модели отсутствует видимое задание с проектом: ${id}`);
      return {path:exercise.project.replace(/\/$/,"")+"/student"};
    },
    files:resource=>resourceFiles(root,resource),
    async save(archives){
      await clearOwned(root,output);
      if(!archives.length) return;
      const outputRoot=resolve(root,output);
      const directory=child(outputRoot,"_downloads");
      await Deno.mkdir(directory,{recursive:true});
      if((await Deno.lstat(outputRoot)).isSymlink) throw new Error("Каталог вывода не должен быть символической ссылкой");
      await noSymlinks(outputRoot,directory);
      // Нельзя перезаписывать файл, которым это расширение не владело.
      for(const archive of archives) if(await exists(join(directory,archive.name))) throw new Error(`Посторонний файл мешает публикации архива: ${archive.name}`);
      // Манифест записывается первым: следующая сборка очистит и прерванную запись.
      await Deno.writeTextFile(join(directory,manifestName),JSON.stringify(archives.map(item=>item.name))+"\n");
      for(const archive of archives) await Deno.writeFile(join(directory,archive.name),archive.bytes,{createNew:true});
    }
  });
}
