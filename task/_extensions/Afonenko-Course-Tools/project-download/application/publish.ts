import { diagnostic } from "../diagnostics.ts";
import { RESOURCE_ID, type Configuration, type Resource } from "../domain/config.ts";
import { zip, type ArchiveEntry } from "../domain/zip.ts";
export type ArtifactKind = "starter" | "full" | "conditions";
export interface ArtifactRequest { exerciseId:string; kind:ArtifactKind }
export interface Request { source:string; resources:string[]; artifacts?:ArtifactRequest[]; courseProcessed?:boolean }
export interface PublishPorts {
  requests():Promise<Request[]>;
  courseResource(id:string,source:string):Promise<Resource>;
  modelArtifact?(request:ArtifactRequest,source:string):Promise<{kind:ArtifactKind;files:ArchiveEntry[]}>;
  files(resource:Resource):Promise<ArchiveEntry[]>;
  save(archives:{name:string;bytes:Uint8Array}[]):Promise<void>;
}
export async function publish(config:Configuration,profiles:string[],ports:PublishPorts):Promise<number> {
  const selected=new Map<string,Resource>();
  const model=new Map<string,ArchiveEntry[]>();
  for(const request of await ports.requests()) {
    for(const artifact of request.artifacts ?? []) {
      if(!RESOURCE_ID.test(artifact.exerciseId) || !["starter","full","conditions"].includes(artifact.kind) || Object.keys(artifact).some(k=>!["exerciseId","kind"].includes(k))) throw diagnostic("DOWNLOAD.REQUEST_INVALID","Недопустимая модельная заявка",{source:request.source,field:"artifacts"});
      if(!config["course-model"] || !ports.modelArtifact) throw diagnostic("DOWNLOAD.CONFIG_INVALID","Модельный комплект требует подключения Core",{source:request.source,id:artifact.exerciseId,field:"course-model"});
      const resolved=await ports.modelArtifact(artifact,request.source);
      if(resolved.kind!==artifact.kind) throw diagnostic("DOWNLOAD.REQUEST_INVALID","Разрешённый комплект не совпадает с текущей ссылкой",{source:request.source,id:artifact.exerciseId,field:"kind"});
      const name=artifact.exerciseId+"-"+resolved.kind+".zip";
      const files=[...resolved.files].sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
      const previous=model.get(name);
      if(previous && !equalBytes(zip(previous),zip(files))) throw diagnostic("DOWNLOAD.REQUEST_INVALID","Несогласованные модельные комплекты",{source:request.source,id:artifact.exerciseId,field:"artifacts"});
      model.set(name,files);
    }
    for(const id of request.resources) {
      if(!RESOURCE_ID.test(id)) throw diagnostic("DOWNLOAD.REQUEST_INVALID", `Недопустимый идентификатор заявки: ${id}`, {source:request.source,id,field:"resources"});
      const resource=config.resources[id] ?? (config["course-model"] && id.startsWith("exr-") ? await ports.courseResource(id,request.source) : undefined);
      if(!resource) throw diagnostic("DOWNLOAD.RESOURCE_UNAVAILABLE", `Не объявлен ресурс: ${id}`, {source:request.source,id,field:"resources",hint:"Объявите ресурс в project-download.resources."});
      if(resource.profiles && !resource.profiles.some(profile=>profiles.includes(profile))) throw diagnostic("DOWNLOAD.RESOURCE_UNAVAILABLE", `Ресурс ${id} недоступен для текущего профиля: ${profiles.join(", ")}; скройте ссылку тем же условием`, {source:request.source,id,field:"profiles",hint:"Согласуйте видимость ссылки с профилями ресурса."});
      const prior=selected.get(id);
      if(prior && JSON.stringify(prior)!==JSON.stringify(resource)) throw diagnostic("DOWNLOAD.REQUEST_INVALID", `Несогласованные определения ресурса: ${id}`, {source:request.source,id,field:"resources"});
      selected.set(id,resource);
    }
  }
  const archives=[];
  for(const [id,resource] of [...selected].sort(([a],[b])=>a<b?-1:1)) {
    const name=id+".zip";
    if(model.has(name)) throw diagnostic("DOWNLOAD.OUTPUT_CONFLICT","Обычный ресурс конфликтует с модельным комплектом",{id,field:"output"});
    archives.push({name,bytes:zip(await ports.files(resource))});
  }
  for(const [name,files] of [...model].sort(([a],[b])=>a<b?-1:1)) archives.push({name,bytes:zip(files)});
  await ports.save(archives); return archives.length;
}
function equalBytes(a:Uint8Array,b:Uint8Array):boolean { return a.length===b.length && a.every((v,i)=>v===b[i]); }
