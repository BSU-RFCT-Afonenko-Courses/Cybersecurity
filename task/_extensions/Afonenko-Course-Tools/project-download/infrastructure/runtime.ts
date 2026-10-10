import { inspectOwnedRequests } from "../ownership.ts";
import { diagnostic, externalFailure } from "../diagnostics.ts";
import {
  dirname,
  fromFileUrl,
  join,
  relative,
  resolve,
  toFileUrl,
} from "stdlib/path";
import { configuration, type Resource, RESOURCE_ID } from "../domain/config.ts";
import { publish, type Request } from "../application/publish.ts";
import { child, exists, noSymlinks, resourceFiles } from "./files.ts";
const manifestName = ".project-download-manifest.json";
async function sha256(bytes:Uint8Array):Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new Uint8Array(bytes))),v=>v.toString(16).padStart(2,"0")).join("");
}
async function inspect(root: string) {
  const executable = Deno.env.get("QUARTO") ||
    Deno.env.get("QUARTO_BIN_PATH") &&
      join(Deno.env.get("QUARTO_BIN_PATH")!, "quarto") ||
    "quarto";
  let result: Deno.CommandOutput;
  try { result = await new Deno.Command(executable, {
    args: ["inspect", root],
    cwd: root,
    stdout: "piped",
    stderr: "piped",
  }).output(); } catch(cause) { if (!Object.values(Deno.errors).some(kind => cause instanceof kind)) throw cause; throw externalFailure(executable,undefined,cause); }
  if (!result.success) throw externalFailure(executable,result);
  if(result.stderr.length) await Deno.stderr.write(result.stderr);
  return JSON.parse(new TextDecoder().decode(result.stdout));
}
function archiveName(name: string): boolean {
  return name.endsWith(".zip") && RESOURCE_ID.test(name.slice(0, -4));
}
export async function clearOwned(root: string, output: string): Promise<void> {
  const outputRoot = resolve(root, output);
  const directory = child(outputRoot, "_downloads");
  if (!await exists(directory)) return;
  if ((await Deno.lstat(outputRoot)).isSymlink) {
    throw diagnostic("DOWNLOAD.PATH_INVALID", "Каталог вывода не должен быть символической ссылкой", {source:outputRoot,field:"output-dir"});
  }
  await noSymlinks(outputRoot, directory);
  const manifest = join(directory, manifestName);
  if (!await exists(manifest)) return;
  await noSymlinks(outputRoot, manifest);
  const files = JSON.parse(await Deno.readTextFile(manifest));
  if (
    !Array.isArray(files) ||
    files.some((name) => typeof name !== "string" || !archiveName(name))
  ) throw diagnostic("DOWNLOAD.REQUEST_INVALID", "Повреждён перечень файлов project-download", {source:manifest,field:"manifest"});
  for (const name of files) {
    const path = join(directory, name);
    if (await exists(path)) {
      await noSymlinks(outputRoot, path);
      await Deno.remove(path);
    }
  }
  await Deno.remove(manifest);
}
export async function prepare(root: string): Promise<void> {
  const inspected = await inspect(root);
  configuration(inspected.config["project-download"]);
  const output = Deno.env.get("QUARTO_PROJECT_OUTPUT_DIR") ||
    inspected.config.project?.["output-dir"] || ".";
  await clearOwned(root, output);
  const receipt=child(root,"_generated/project-download/artifacts-receipt.json");
  if(await exists(receipt)) {
    await noSymlinks(root,receipt);
    const value=JSON.parse(await Deno.readTextFile(receipt));
    if(value?.schema!=="project-download-artifacts-v1") throw diagnostic("DOWNLOAD.OUTPUT_CONFLICT","Чужой файл на пути receipt",{source:receipt,field:"receipt"});
    await Deno.remove(receipt);
  }
  const requests = child(root, "_generated/project-download/requests");
  if (await exists(requests)) {
    await noSymlinks(root, requests);
    await Deno.remove(requests, { recursive: true });
  }
}
export interface NativeDownloadContext {
  run: {
    projectRoot: string;
    outputDirectory: string;
    profiles: string[];
    documents: any[];
    inputFiles?: string[];
  };
  resolveArtifact?(run:any, request:{source:string;exerciseId:string;kind:string}):Promise<any>;
  evaluateResources(
    options: { facts: any[]; selected: string[]; projectRoot: string; publicPayload?: boolean; authoredInputs?: string[] },
  ): Promise<unknown>;
}
/** Explicit current native inventory; the caller also requires successful process exit. */
export async function finish(
  root: string,
  current?: NativeDownloadContext,
): Promise<number> {
  const inspected = await inspect(root),
    config = configuration(inspected.config["project-download"]);
  const output = Deno.env.get("QUARTO_PROJECT_OUTPUT_DIR") ||
    inspected.config.project?.["output-dir"] || ".";
  const selected = new Set<string>(
    inspected.files.input.map((path: string) =>
      relative(root, path).replaceAll("\\", "/")
    ),
  );
  const profiles = (Deno.env.get("QUARTO_PROFILE") || "").split(",").filter(
    Boolean,
  );
  const directory = join(root, "_generated/project-download/requests");
  const requests: Request[] = [];
  if (await exists(directory)) {
    const owned = await inspectOwnedRequests(root, [...selected]);
    for (const file of owned.files) requests.push(JSON.parse(await Deno.readTextFile(file.path)));
  }
  if (
    !current &&
    (config["course-model"] ||
      requests.some((request) => request.courseProcessed === true))
  ) {
    // Core and Download installed from GitHub share the provider directory.
    const extension = dirname(dirname(fromFileUrl(import.meta.url)));
    const core = join(dirname(extension), "course-core");
    const { loadNativeRun } = await import(
      toFileUrl(join(core, "infrastructure/native-run.ts")).href
    );
    const { evaluateResources } = await import(
      toFileUrl(join(core, "infrastructure/resources.ts")).href
    );
    const { resolveArtifact } = await import(toFileUrl(join(core, "artifacts/resolve.ts")).href);
    current = { run: await loadNativeRun(root), evaluateResources, resolveArtifact };
  }
  if (
    current &&
    (resolve(current.run.projectRoot) !== resolve(root) ||
      resolve(current.run.outputDirectory) !== resolve(root, output))
  ) {
    throw diagnostic("DOWNLOAD.REQUEST_INVALID", "Нативный контекст не соответствует текущему проекту и каталогу вывода", {source:root,field:"projectRoot/outputDirectory",related:[{source:current.run.projectRoot},{source:current.run.outputDirectory}]});
  }
  const facts =
    current?.run.documents.flatMap((d) => d.resources ? [d.resources] : []) ??
      [];
  const authoredInputs = new Set<string>([
    ...inspected.files.input,
    ...(current?.run.inputFiles ?? []),
    ...(current?.run.documents.map((d) => resolve(root, d.source)) ?? []),
  ].map((path) => resolve(root, path)));
  const projectDirectories = [...facts.flatMap((fact) => fact.rawProjectRoots ?? []), ...(current?.run.documents ?? []).flatMap((document) =>
    [...(document.exercises ?? []), ...(document.body?.publicExercises ?? [])]
      .filter((exercise) => typeof exercise.project === "string")
      .map((exercise) => resolve(root, exercise.project.replace(/^\//, "")))
  )].map((project) => resolve(root, project));
  const closedProjectRoots = projectDirectories.flatMap((project) =>
    ["tests", "closed-tests"].map((directory) => resolve(project, directory))
  );
  for (const project of projectDirectories) authoredInputs.add(join(project, "check.sh"));
  // Configured build/filter scripts are service inputs, even outside _extensions.
  for (const value of [inspected.config.project?.["pre-render"], inspected.config.project?.["post-render"], inspected.config.filters]) {
    for (const declaration of Array.isArray(value) ? value : value ? [value] : []) {
      const command = typeof declaration === "string" ? declaration : declaration?.path;
      if (typeof command !== "string") continue;
      // Object-form filter paths are literal filenames, including spaces.
      const paths = typeof declaration === "string"
        ? [command, ...(command.match(/"[^"]*"|'[^']*'|[^\s]+/g) ?? []).map((token) => token.replace(/^["']|["']$/g, ""))]
        : [command];
      for (const path of paths) {
        const input = resolve(root, path);
        if (await exists(input) && (await Deno.stat(input)).isFile) authoredInputs.add(input);
      }
    }
  }
  return await publish(config, profiles, {
    async requests() {
      for (const request of requests) {
        if (
          current &&
          !current.run.documents.some((d) => d.source === request.source)
        ) {
          throw diagnostic("DOWNLOAD.REQUEST_INVALID", "В заявке нет текущего нативного документа", {source:request.source,field:"source"});
        }
      }
      return requests;
    },
    async courseResource(id, source): Promise<Resource> {
      const document = current?.run.documents.find((d) => d.source === source);
      const exercise = (document?.body?.publicExercises ?? [])
        .find((item: any) => item.id === id);
      if (!exercise?.project) {
        throw diagnostic("DOWNLOAD.RESOURCE_UNAVAILABLE", `В текущем документе отсутствует публичное задание с проектом: ${id}`, {source,id,field:"project"});
      }
      return { path: exercise.project.replace(/\/$/, "") + "/student" };
    },
    async modelArtifact(request, source) {
      if (!current?.resolveArtifact) throw diagnostic("DOWNLOAD.CONFIG_INVALID", "Требуется Core с модельными комплектами", {source,id:request.exerciseId,field:"course-model"});
      const artifact = await current.resolveArtifact(current.run, {source,exerciseId:request.exerciseId,kind:request.kind});
      if (artifact.kind === "conditions") {
        if (!Array.isArray(artifact.files)) throw diagnostic("DOWNLOAD.RESOURCE_UNAVAILABLE", "Core не предоставил переносимое условие", {source,id:request.exerciseId,field:"conditions"});
        return {kind:artifact.kind,files:artifact.files};
      }
      const project = artifact.projectRoot;
      if (typeof project !== "string") throw diagnostic("DOWNLOAD.REQUEST_INVALID", "Core не предоставил разрешённый проект", {source,id:request.exerciseId,field:"projectRoot"});
      const base = project.replace(/^\//, "").replace(/\/$/, "");
      const directory = artifact.kind === "starter" ? base+"/student" : base;
      const files = await resourceFiles(root, {path:directory});
      const accepted=[];
      for(const file of files) {
        const path=join(directory,file.name);
        const gitignore=artifact.kind === "starter" ? file.name === ".gitignore" : file.name === "student/.gitignore";
        if (/\.(?:qmd|rmd|ipynb|class|jar)$/i.test(file.name) || /(^|\/)(?:_quarto(?:[-.][^/]*)?|_metadata\.ya?ml)$/i.test(file.name) || authoredInputs.has(resolve(root,path)) || (!gitignore && /(^|\/)(?:\.[^/]+|_extensions|_freeze|_generated|_site[^/]*|_book[^/]*)(\/|$)/.test(file.name)) || file.name === "check.sh") continue;
        accepted.push(file);
      }
      if (!accepted.length) throw diagnostic("DOWNLOAD.SELECTION_EMPTY", "Разрешённый комплект пуст", {source,id:request.exerciseId,field:"project"});
      return {kind:artifact.kind,files:accepted};
    },
    async files(resource) {
      const files = await resourceFiles(root, resource);
      const directory = resource.path.replace(/^\//, "");
      for (const file of files) {
        const path = join(directory, file.name).replaceAll("\\", "/");
        if (
          /(^|\/)(?:\.[^/]+|_extensions|_freeze|_generated|reference|solutions?)(\/|$)/.test(path) ||
          /\.(?:qmd|rmd|ipynb)$/i.test(file.name) ||
          /(^|\/)(?:_quarto(?:[-.][^/]*)?|_metadata\.ya?ml)$/i.test(path) ||
          authoredInputs.has(resolve(root, path)) ||
          closedProjectRoots.some((directory) => resolve(root, path).replaceAll("\\", "/").startsWith(directory.replaceAll("\\", "/") + "/"))
        ) throw diagnostic("RESOURCE.PRIVATE_OR_SOURCE", "Ресурс содержит закрытый материал или авторский исходник", {source:path,id:resource.path,field:"resources",hint:"Выберите публичные стартовые материалы, исключив служебные и закрытые файлы."});
      }
      if (current) {
        await current.evaluateResources({
          facts,
          selected: files.map((file) => join(directory, file.name)),
          projectRoot: root,
          publicPayload: true,
          authoredInputs: [...authoredInputs],
        });
      }
      return files;
    },
    async save(archives) {
      const receiptPath=child(root,"_generated/project-download/artifacts-receipt.json");
      if(await exists(receiptPath)) {
        await noSymlinks(root,receiptPath);
        const previous=JSON.parse(await Deno.readTextFile(receiptPath));
        if(previous?.schema!=="project-download-artifacts-v1") throw diagnostic("DOWNLOAD.OUTPUT_CONFLICT","Чужой файл на пути receipt",{source:receiptPath,field:"receipt"});
      }
      await clearOwned(root, output);
      if (!archives.length) return;
      const outputRoot = resolve(root, output);
      const directory = child(outputRoot, "_downloads");
      await Deno.mkdir(directory, { recursive: true });
      if ((await Deno.lstat(outputRoot)).isSymlink) {
        throw diagnostic("DOWNLOAD.PATH_INVALID", "Каталог вывода не должен быть символической ссылкой", {source:outputRoot,field:"output-dir"});
      }
      await noSymlinks(outputRoot, directory);
      // Нельзя перезаписывать файл, которым это расширение не владело.
      for (const archive of archives) {
        if (await exists(join(directory, archive.name))) {
          throw diagnostic("DOWNLOAD.OUTPUT_CONFLICT", `Посторонний файл мешает публикации архива: ${archive.name}`, {source:join(directory,archive.name),id:archive.name,field:"output",hint:"Выберите свободный путь или переместите посторонний архив."});
        }
      }
      // Манифест записывается первым: следующая сборка очистит и прерванную запись.
      await Deno.writeTextFile(
        join(directory, manifestName),
        JSON.stringify(archives.map((item) => item.name)) + "\n",
      );
      for (const archive of archives) {
        await Deno.writeFile(join(directory, archive.name), archive.bytes, {
          createNew: true,
        });
      }
      await Deno.mkdir(dirname(receiptPath),{recursive:true});
      if(await exists(receiptPath)) {
        await noSymlinks(root,receiptPath);
        const previous=JSON.parse(await Deno.readTextFile(receiptPath));
        if(previous?.schema!=="project-download-artifacts-v1") throw diagnostic("DOWNLOAD.OUTPUT_CONFLICT","Чужой файл на пути receipt",{source:receiptPath,field:"receipt"});
        await Deno.remove(receiptPath);
      }
      const artifactRequests=requests.flatMap(request=>(request.artifacts??[]).map(artifact=>({...artifact,source:request.source})));
      const audienceValues=[...new Set((current?.run.documents ?? []).map(d=>d.course?.view).filter(v=>v==="student" || v==="full"))].sort();
      const audience=audienceValues.length===1 ? audienceValues[0] : null;
      const entries=[];
      for(const archive of archives) {
        const request=artifactRequests.find(a=>a.exerciseId+"-"+a.kind+".zip"===archive.name);
        entries.push({name:archive.name,audience,sha256:await sha256(archive.bytes),...(request?{exerciseId:request.exerciseId,kind:request.kind,source:request.source,audience:current?.run.documents.find(d=>d.source===request.source)?.course?.view??null}:{} )});
      }
      await Deno.writeTextFile(receiptPath,JSON.stringify({schema:"project-download-artifacts-v1",audience,audiences:audienceValues,profiles,sourceRunHash:current?await sha256(new TextEncoder().encode(JSON.stringify(current.run))):null,archives:entries},null,2)+"\n",{createNew:true});
    },
  });
}
