import {createMetrics as __createMetrics} from "../observability/bridge.ts";
const __metrics=__createMetrics("course-core");
import { diagnostic } from "../domain/diagnostics.ts";
import { dirname, fromFileUrl, toFileUrl, join, relative, resolve } from "stdlib/path";
import { assembleRelease } from "../domain/release.ts";
import type { ReleaseResult } from "../domain/model.ts";
import type {BodyReferenceContext} from "./links.ts";
import { command, quartoExecutable } from "../infrastructure/process.ts";
import { loadNativeRun, prepareNativeExportCleanup } from "../infrastructure/native-run.ts";

/** One native source pass, from the logical root, over one explicitly chosen bank.
 * Quarto resolves includes, computations and functional profiles. Its JSON writer
 * does not publish a full HTML book. The short-lived profile only changes native
 * project/writer context; source QMD and the permanent project config stay intact.
 */
export async function collectExport(root: string, options: {
  book: string;
  work: string;
  profiles?: string[];
}): Promise<{result: ReleaseResult; projectRoot: string; courseId: string; work: string; bodyReferences?: BodyReferenceContext}> {
  root = await Deno.realPath(root);
  if (!options.book || !options.work) throw diagnostic("EXPORT.BOOK_WORK_REQUIRED", "Укажите банк и работу", {source: root, field: "book/work"});
  const projectRoot = await Deno.realPath(resolve(root, options.book));
  const path = relative(root, projectRoot);
  if (path === ".." || path.startsWith("../") || path.startsWith("..\\")) throw diagnostic("EXPORT.BOOK_OUTSIDE_COURSE", "Банк расположен за пределами курса", {source: projectRoot, id: options.work});
  const quarto = quartoExecutable();
  const inspected = JSON.parse(await command(quarto, ["inspect", root], root));
  const courseId = inspected.config.course?.id;
  if (typeof courseId !== "string" || !/^[a-z][a-z0-9-]*$/.test(courseId)) throw diagnostic("BODY.COURSE_ID_REQUIRED", "Требуется корректный идентификатор курса", {source: projectRoot, id: options.work});
  const functional = options.profiles ?? [];
  if (functional.some(p => !/^[a-z][a-z0-9-]*$/.test(p) || ["student", "full"].includes(p))) throw diagnostic("EXPORT.FUNCTIONAL_PROFILES_REQUIRED", "Укажите только имена функциональных профилей", {source: projectRoot, id: options.work});
  const configs = await Promise.all(["_quarto.yml", "_quarto.yaml"].map(async name => {
    try { return (await Deno.stat(join(projectRoot, name))).isFile; }
    catch (e) { if (e instanceof Deno.errors.NotFound) return false; throw e; }
  }));
  if (!configs.some(Boolean)) throw diagnostic("EXPORT.BOOK_PROJECT_REQUIRED", "Выбранный банк должен быть самостоятельным проектом book", {source: projectRoot, id: options.work});
  const bank = JSON.parse(await command(quarto, ["inspect", projectRoot, "--profile", ["full", ...functional].join(",")], projectRoot));
  if (bank.config.project?.type !== "book") throw diagnostic("EXPORT.BOOK_PROJECT_REQUIRED", "Выбранный банк должен быть самостоятельным проектом book", {source: projectRoot, id: options.work});
  for (const p of functional) {
    const files = await Promise.all(["yml", "yaml"].map(async suffix => {
      try { return (await Deno.stat(join(projectRoot, "_quarto-" + p + "." + suffix))).isFile; }
      catch (e) { if (e instanceof Deno.errors.NotFound) return false; throw e; }
    }));
    if (!files.some(Boolean)) throw diagnostic("EXPORT.PROFILE_MISSING", "Функциональный профиль не найден: " + p, {source: projectRoot, id: options.work});
  }
  const extension = dirname(dirname(fromFileUrl(import.meta.url)));
  const name = "course-export-" + crypto.randomUUID();
  const profile = join(projectRoot, "_quarto-" + name + ".yml");
  const output = join(projectRoot, "_generated/course-spec/export-output", name);
  const config = {
    project: {
      type: "default",
      render: ["**/*.qmd", "!_extensions/**", "!_generated/**"],
      "output-dir": output,
      "pre-render": join(extension, "entrypoints/pre.ts"),
      "post-render": join(extension, "entrypoints/post.ts"),
    },
    course: {id: courseId, view: "full"},
    "course-export-context": true,
    format: {json: {}},
    filters: ["course-core"],
    crossref: {},
  };
  await Deno.writeTextFile(profile, JSON.stringify(config));
  let collected=false;
  try {
    const profiles = [name, "full", ...functional];
    // Explicit recursive render globs cross nested Quarto project boundaries.
    // Use the public native inventory, then resolve native project ownership
    // once per input directory before any source executes or Core validates it.
    const inventory = JSON.parse(await command(quarto,
      ["inspect", projectRoot, "--profile", profiles.join(",")], projectRoot));
    const representatives = new Map<string, string>();
    const inputs: {lexical: string; physical: string}[] = [];
    for (const lexical of inventory.files.input as string[]) {
      const physical = await Deno.realPath(lexical);
      const location = relative(projectRoot, physical);
      if (location === ".." || location.startsWith("../") || location.startsWith("..\\"))
        throw diagnostic("EXPORT.SOURCE_OUTSIDE_BANK", "Входной документ расположен за пределами банка: " + lexical, {source: projectRoot, id: options.work});
      inputs.push({lexical, physical});
      if (!representatives.has(dirname(physical))) representatives.set(dirname(physical), physical);
    }
    const nativeRoot = await Deno.realPath(inventory.dir);
    if (nativeRoot !== projectRoot) throw diagnostic("EXPORT.BANK_OWNERSHIP_MISMATCH", "Корень выбранного банка не совпадает с native project", {source: projectRoot, id: options.work});
    const owners = new Map<string, string>([[projectRoot, nativeRoot]]);
    for (const [directory, input] of representatives) {
      if (owners.has(directory)) continue;
      const document = JSON.parse(await command(quarto,
        ["inspect", input, "--profile", profiles.join(",")], projectRoot));
      if (!document.project?.dir) throw diagnostic("EXPORT.PROJECT_OWNERSHIP_MISSING", "Не определён native project входного документа: " + input, {source: projectRoot, id: options.work});
      owners.set(directory, await Deno.realPath(document.project.dir));
    }
    const selectedInputs = inputs.filter(input => owners.get(dirname(input.physical)) === projectRoot)
      .map(input => relative(projectRoot, input.lexical).replaceAll("\\", "/"));
    if (!selectedInputs.length) throw diagnostic("EXPORT.BANK_INPUTS_EMPTY", "У выбранного банка нет входных документов", {source: projectRoot, id: options.work});
    config.project.render = selectedInputs;
    await Deno.writeTextFile(profile, JSON.stringify(config));
    await command(quarto, ["render", ".", "--profile", profiles.join(","), "--to", "json", "--output-dir", output, "--fail-if-warnings=false"], projectRoot);
    const run = await loadNativeRun(projectRoot, {profiles, view: "full", outputDirectory: output});
    const allowed = new Set(selectedInputs);
    for (const d of run.documents) if (!allowed.has(d.source)) throw diagnostic("EXPORT.BANK_INPUT_MISMATCH", "Сборка вернула документ вне выбранного банка: " + d.source, {source: d.source, id: options.work});
    // Bank identity conflicts are source errors, but capabilities and membership
    // of unrelated works are outside this explicitly selected export.
    const exerciseIds = new Map<string, string>(), workIds = new Map<string, string>();
    for (const d of run.documents) {
      for (const e of d.exercises) {
        if (exerciseIds.has(e.id)) throw diagnostic("CORE.DUPLICATE_EXERCISE", "Повторный идентификатор упражнения", {source: d.source, id: e.id, field: "id", related: [{source: exerciseIds.get(e.id), id: e.id}]});
        exerciseIds.set(e.id, d.source);
      }
      if (d.assessment) {
        if (workIds.has(d.assessment.id)) throw diagnostic("CORE.DUPLICATE_ASSESSMENT", "Повторный идентификатор работы", {source: d.source, id: d.assessment.id, field: "id", related: [{source: workIds.get(d.assessment.id), id: d.assessment.id}]});
        workIds.set(d.assessment.id, d.source);
      }
    }
    const workId = options.work.startsWith(courseId + "/") ? options.work.slice(courseId.length + 1) : options.work;
    const selected = run.documents.find(d => d.assessment?.id === workId)?.assessment;
    if (!selected && options.work!=="*") throw diagnostic("BODY.WORK_MISSING", "Выбранная работа отсутствует: " + workId, {source: projectRoot, id: options.work});
    const ids = new Set(options.work==="*"?run.documents.flatMap(d=>d.exercises.map(e=>e.id)):selected!.slots.flatMap(slot=>slot.candidates));
    const declarationIds=new Set([...ids,...(selected?.relatedExercise?[selected.relatedExercise]:[])]);
    const documents = run.documents.filter(d => options.work==="*" || d.assessment?.id === workId || d.exercises.some(e => ids.has(e.id)) || d.declarations?.some(e=>declarationIds.has(e.id))).map(d => ({
      ...d,
      exercises: d.exercises.filter(e => ids.has(e.id)),
      declarations:d.declarations?.filter(e=>declarationIds.has(e.id)),
      rawAssessment:options.work==="*"||d.rawAssessment?.id===workId?d.rawAssessment:null,
      assessment: options.work==="*"||d.assessment?.id === workId ? d.assessment : null,
      body: d.body ? {...d.body, publicExercises: d.body.publicExercises.filter(e => ids.has(e.id)), publicAssessment: options.work==="*"||d.assessment?.id === workId ? d.body.publicAssessment : null} : undefined,
    }));
    // The native writer resolves shortcodes after Core's pre-ast capture. Read
    // native JSON nodes, preserving Core's independent public projection and
    // normalized keys instead of parsing authored shortcode syntax ourselves.
    for (const d of documents) {
      const ast = JSON.parse(await Deno.readTextFile(join(output, d.document.output)));
      const wrapper = ast.blocks.find((n: any) => n.t === "Div" && n.c[0][2].some((p: string[]) => p[0] === "data-course-export-projection" && p[1] === "public"));
      if (!wrapper) throw diagnostic("EXPORT.PUBLIC_PROJECTION_MISSING", "В результате отсутствует публичная проекция: " + d.source, {source: d.source, id: options.work});
      const fullNodes = new Map<string, any>(), publicNodes = new Map<string, any>();
      function index(value: any, nodes: Map<string, any>) {
        if (Array.isArray(value)) { for (const child of value) index(child, nodes); return; }
        if (!value || typeof value !== "object") return;
        if (value.t === "Div" && value.c[0][0]?.startsWith("exr-")) nodes.set(value.c[0][0], value);
        for (const child of Object.values(value)) index(child, nodes);
      }
      index(ast.blocks.filter((n: any) => n !== wrapper), fullNodes);
      index(wrapper.c[1], publicNodes);
      const publicSolutions=new Set<string>();
      function solutions(value:any,owner?:string){
        if(Array.isArray(value)){for(const child of value)solutions(child,owner);return;}
        if(!value||typeof value!=="object")return;
        if(value.t==="Div"){
          const [id,classes,attrs]=value.c[0];
          const related=attrs.find((pair:string[])=>pair[0]==="data-course-solution-owner")?.[1] ?? (id.startsWith("sol-")?"exr-"+id.slice(4):classes.includes("solution")?owner:undefined);
          if(related)publicSolutions.add(related);
          solutions(value.c[1],id.startsWith("exr-")?id:owner);return;
        }
        for(const child of Object.values(value))solutions(child,owner);
      }
      solutions(wrapper.c[1]);
      for(const fact of d.declarations??[])fact.hasPublicSolution=publicSolutions.has(fact.id);
      for(const exercise of [...d.exercises,...d.body?.publicExercises??[]])exercise.hasPublicSolution=publicSolutions.has(exercise.id);
      const body = (node: any) => JSON.stringify({"pandoc-api-version": ast["pandoc-api-version"], meta: ast.meta, blocks: node.c[1]});
      if (d.body?.publicAssessment) d.body.publicIntroductionJson = body(wrapper);
      for (const e of d.exercises) {
        const node = fullNodes.get(e.id);
        if (!node) throw diagnostic("EXPORT.SOURCE_EXERCISE_MISSING", "В полном native AST не найдено упражнение: " + d.source + "/" + e.id, {source: d.source, id: e.id, field: "bodyJson", related: [{id: options.work}]});
        e.bodyJson = body(node);
      }
      for (const e of d.body?.publicExercises ?? []) {
        const node = publicNodes.get(e.id);
        if (!node) throw diagnostic("EXPORT.PUBLIC_EXERCISE_MISSING", "В публичном native AST не найдено упражнение: " + d.source + "/" + e.id, {source: d.source, id: e.id, field: "bodyJson", related: [{id: options.work}]});
        e.bodyJson = body(node);
      }
    }
    const result = assembleRelease(documents.map(d => d.source), documents, run.adapters, {view: "full", profiles});
    collected=true;
    const namespace = bank.config["reference-catalog"]?.namespace;
    let bodyReferences: BodyReferenceContext | undefined;
    if (typeof namespace === "string") {
      const baseUrl = inspected.config.website?.["site-url"] ?? inspected.config["course-navigation"]?.["course-url"] ?? bank.config["course-navigation"]?.["course-url"];
      const catalogFile = join(root, inspected.config.project?.["output-dir"] ?? "_site", "reference-catalog.json");
      let resolver: Promise<any> | undefined;
      const sourceUrls = new Map<string, Promise<string>>();
      bodyReferences = {
        namespace,
        ...(baseUrl ? {
        async sourceUrl(source: string) {
          if (!sourceUrls.has(source)) sourceUrls.set(source, (async () => {
            const input = await Deno.realPath(resolve(projectRoot, source));
            const inside = relative(root, input);
            if (inside === ".." || inside.startsWith("../") || inside.startsWith("..\\")) {
              throw diagnostic("BODY.PUBLICATION_TARGET_OUTSIDE_COURSE", "Ссылка ведёт за пределы native курса", {source, field: "reference"});
            }
            // Inspect the original native profile, not the temporary JSON writer.
            // Quarto owns output-file, format inheritance and Reveal selection.
            const native = JSON.parse(await command(quarto, ["inspect", input, "--profile", ["full", ...functional].join(",")], projectRoot));
            const formats = Object.values(native.formats ?? {}).filter((format: any) =>
              ["html", "revealjs"].includes(format.identifier?.["base-format"] ?? format.pandoc?.to)) as any[];
            if (formats.length !== 1 || typeof formats[0].pandoc?.["output-file"] !== "string") {
              throw diagnostic("BODY.PUBLICATION_TARGET_AMBIGUOUS", "Требуется однозначный native HTML/Reveal output", {source, field: "reference"});
            }
            const output = relative(root, resolve(dirname(input), formats[0].pandoc["output-file"])).replaceAll("\\", "/");
            if (output.startsWith("../") || output === "..") throw diagnostic("BODY.PUBLICATION_TARGET_OUTSIDE_COURSE", "Native output ведёт за пределы курса", {source, field: "reference"});
            return new URL(output.split("/").map(encodeURIComponent).join("/"), baseUrl).href;
          })());
          return await sourceUrls.get(source)!;
        },
        } : {}),
        async resolve(key: string, style: string, source: string) {
          if (!baseUrl) throw diagnostic("BODY.QRC_REFERENCE_UNRESOLVED", "Для ссылки QRC требуется публичный базовый URL", {source, id: key, field: "publication"});
          if (!resolver) resolver = (async () => {
            const candidates = [join(projectRoot, "_extensions/reference-catalog/entrypoints/body-links.ts"), join(projectRoot, "_extensions/Afonenko-Course-Tools/reference-catalog/entrypoints/body-links.ts")];
            for (const candidate of candidates) {
              try {await Deno.stat(candidate);} catch (e) {if (e instanceof Deno.errors.NotFound) continue; throw e;}
              const api = await import(toFileUrl(candidate).href);
              return await api.loadBodyLinks({root: projectRoot, namespace, baseUrl, catalogFile, imports: bank.config["reference-catalog"]?.imports});
            }
            throw diagnostic("BODY.QRC_REFERENCE_UNRESOLVED", "Установите QRC с публичным Body API", {source, id: key, field: "reference"});
          })();
          return (await resolver).resolve(key, style, source);
        },
      };
    }
    return {result, projectRoot, courseId, work: workId, bodyReferences};
  } finally {
    try { if(collected)await prepareNativeExportCleanup(projectRoot,name); }
    finally { await Deno.remove(profile); }
  }
}

/** Fresh native owner inventory independent of any platform or selected work. */
export async function collectNativeModel(root:string,options:{book:string;profiles?:string[]}) {
  return await collectExport(root,{...options,work:"*"});
}

// @ts-expect-error JS допускает замену function binding; сигнатура публичного API сохраняется.
collectExport=__metrics.wrapAsync({id:"course-core.body-export.collect.collectExport",kind:"phase"},collectExport);
// @ts-expect-error JS допускает замену function binding; сигнатура публичного API сохраняется.
collectNativeModel=__metrics.wrapAsync({id:"course-core.body-export.collect.collectNativeModel",kind:"phase"},collectNativeModel);
