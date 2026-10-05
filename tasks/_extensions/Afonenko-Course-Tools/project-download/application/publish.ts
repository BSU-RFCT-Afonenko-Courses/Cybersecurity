import { RESOURCE_ID, type Configuration, type Resource } from "../domain/config.ts";
import { zip } from "../domain/zip.ts";
export interface Request { source:string; resources:string[] }
export interface PublishPorts {
  requests():Promise<Request[]>;
  courseResource(id:string,source:string):Promise<Resource>;
  files(resource:Resource):Promise<{name:string;bytes:Uint8Array}[]>;
  save(archives:{name:string;bytes:Uint8Array}[]):Promise<void>;
}
export async function publish(config:Configuration,profiles:string[],ports:PublishPorts):Promise<number> {
  const selected=new Map<string,Resource>();
  for(const request of await ports.requests()) for(const id of request.resources) {
    if(!RESOURCE_ID.test(id)) throw new Error(`Недопустимый идентификатор заявки: ${id}`);
    const resource=config.resources[id] ?? (config["course-model"] && id.startsWith("exr-") ? await ports.courseResource(id,request.source) : undefined);
    if(!resource) throw new Error(`Не объявлен ресурс: ${id}`);
    if(resource.profiles && !resource.profiles.some(profile=>profiles.includes(profile))) throw new Error(`Ресурс ${id} недоступен для текущего профиля; скройте ссылку тем же условием`);
    const prior=selected.get(id);
    if(prior && JSON.stringify(prior)!==JSON.stringify(resource)) throw new Error(`Несогласованные определения ресурса: ${id}`);
    selected.set(id,resource);
  }
  const archives=[];
  for(const [id,resource] of [...selected].sort(([a],[b])=>a<b?-1:1)) archives.push({name:id+".zip",bytes:zip(await ports.files(resource))});
  await ports.save(archives); return archives.length;
}
