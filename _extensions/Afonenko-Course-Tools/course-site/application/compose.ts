import { createMetrics as __createMetrics } from "../observability/bridge.ts";
const __metrics = __createMetrics("course-site");
import { addressNavigation } from "../infrastructure/navigation.ts";
import { diagnostic } from "../infrastructure/diagnostics.ts";
import {
  cleanOutput,
  copyFiles,
  dirname,
  files,
  fromFileUrl,
  inside,
  join,
  outputDirectory,
  relative,
  resolve,
  safePath,
  toFileUrl,
} from "../infrastructure/files.ts";
import {
  inspectProject,
  validateAudience,
  validateAudienceOutputs,
  workspace,
} from "../infrastructure/config.ts";
import { profileArguments, quarto } from "../infrastructure/process.ts";
import { publicOutputs, readCollection } from "../infrastructure/collection.ts";
const siblings = dirname(dirname(dirname(fromFileUrl(import.meta.url))));
function ownerSiblings(root: string) {
  const parts = siblings.split("/");
  return join(root, ...parts.slice(parts.lastIndexOf("_extensions")));
}
async function module(
  name: string,
  path: string,
  owner?: string,
): Promise<any> {
  const source = join(owner ? ownerSiblings(owner) : siblings, name, path);
  try {
    await Deno.stat(source);
  } catch (cause) {
    if (!(cause instanceof Deno.errors.NotFound)) throw cause;
    throw diagnostic(
      "SITE.SIBLING_MISSING",
      "Не установлен требуемый модуль соседнего расширения",
      {
        source,
        id: name,
        field: "module",
        hint: "Установите Core/QRC рядом с course-site в одном namespace.",
      },
      cause,
    );
  }
  // An existing module's initialization/import failure belongs to its owner.
  return await import(toFileUrl(source).href);
}
const statePath = (root: string) =>
  join(root, "_generated/course-site/active.json");
async function remove(path: string) {
  try {
    await Deno.remove(path);
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }
}
// Core 9 использует native TS по умолчанию. Это только выбор технического
// маршрута: право на выдачу всё равно подтверждает текущая операция Core.
function nativeCore(config: any): boolean {
  if (config["course-core-runtime"] !== undefined) {
    return config["course-core-runtime"] === "native-ts";
  }
  const filters = Array.isArray(config.filters)
    ? config.filters
    : [config.filters];
  return filters.some((filter: any) =>
    filter === "course-core" || filter?.path === "course-core"
  );
}
function releaseQualification(config: any, root: string) {
  if (config.course && !nativeCore(config)) {
    throw diagnostic(
      "SITE.RELEASE_UNQUALIFIED",
      "Course release требует публичную текущую native operation Core",
      { source: root, field: "filters/course-core-runtime" },
    );
  }

  if (
    (config["course-core-runtime"] !== undefined || nativeCore(config)) &&
    ((config["course-core-runtime"] !== undefined &&
      config["course-core-runtime"] !== "native-ts") ||
      !["student", "author"].includes(
        config["course-core-projection"] ??
          (config.course?.view === "full" ? "author" : "student"),
      ))
  ) {
    throw diagnostic(
      "SITE.NATIVE_UNQUALIFIED",
      "Публичная операция требует Core native TS и проекцию student/author",
      { source: root, field: "course-core-runtime/projection" },
    );
  }
}
async function coreHook(root: string, config: any, phase: "pre" | "post") {
  releaseQualification(config, root);
  if (nativeCore(config)) {
    await quarto(
      [
        "run",
        join(siblings, "course-core", "entrypoints", "native-" + phase + ".ts"),
      ],
      root,
      {},
      true,
    );
    if (phase === "pre") {
      const path = join(siblings, "course-prairielearn", "public.ts");
      let PL: any;
      try {
        await Deno.stat(path);
        PL = await import(toFileUrl(path).href);
      } catch (cause) {
        if (!(cause instanceof Deno.errors.NotFound)) throw cause;
      }
      if (PL) {
        await PL.prepareNativeAdapter(
          await module("course-core", "public.ts"),
          {
            root,
            profiles: (Deno.env.get("QUARTO_PROFILE") || "").split(",").filter(
              Boolean,
            ),
            projection: projection(config),
            outputDirectory: resolve(
              root,
              Deno.env.get("QUARTO_PROJECT_OUTPUT_DIR") ||
                config.project?.["output-dir"] || "_site",
            ),
          },
        );
      }
    }
  }
}
function projection(config: any): "student" | "author" {
  return config["course-core-projection"] ??
    (config.course?.view === "full" ? "author" : "student");
}
async function ownerRelease(
  root: string,
  operation: any,
  Core: any,
  selectedSources?: string[],
) {
  let PL: any;
  const path = join(ownerSiblings(root), "course-prairielearn", "public.ts");
  try {
    await Deno.stat(path);
    PL = await import(toFileUrl(path).href);
  } catch (cause) {
    if (!(cause instanceof Deno.errors.NotFound)) throw cause;
  }
  const adapter = PL?.createNativeAdapter({ root, core: Core });
  const request = {
      expectedSources: selectedSources ??
        operation.catalog.documents.map((d: any) => d.source),
    },
    before = operation.metrics;
  let proof = await operation.validateRelease(
      request,
      adapter ? [adapter] : [],
    ),
    validationPasses = 1;
  if (proof.validatedAdapters.includes("prairielearn")) {
    proof = await adapter.validateCourse(operation, request);
    validationPasses++;
  }
  return {
    proof,
    validationPasses,
    metricsBefore: before,
    metricsAfter: operation.metrics,
  };
}
function catalogCoverage(catalog: any, record: any) {
  const documents = catalog.documents;
  const sources = new Set(documents.map((document: any) => document.source));
  const expectedSources = record.selectedSources &&
    new Set(record.selectedSources);
  const outputs = documents.map((document: any) =>
    resolve(record.outputDir, document.output)
  );
  const actual = new Set(outputs);
  const expected = new Set(
    record.nativeOutputs.filter((path: string) => path.endsWith(".html")),
  );
  if (
    sources.size !== documents.length ||
    (expectedSources &&
      (sources.size !== expectedSources.size ||
        [...sources].some((source) => !expectedSources.has(source)))) ||
    actual.size !== outputs.length || actual.size !== expected.size ||
    [...actual].some((path) => !expected.has(path)) ||
    (record.to && record.to !== "default" &&
      documents.some((document: any) => document.format !== record.to))
  ) {
    throw diagnostic(
      "SITE.CURRENT_RESULT_MISSING",
      "Публичный каталог Core не совпадает с native selection, outputs или выбранным to",
      {
        source: record.projectRoot,
        field: "selectedSources/output/format",
        hint:
          "Проверьте неизменность native selection и явный формат компонента.",
      },
    );
  }
}
async function progress<T>(
  stage: string,
  project: string,
  action: () => Promise<T>,
): Promise<T> {
  const started = performance.now();
  console.error(`course-site: ${stage}: ${project} — начало`);
  try {
    const value = await action();
    console.error(
      `course-site: ${stage}: ${project} — готово (${
        ((performance.now() - started) / 1000).toFixed(1)
      } с)`,
    );
    return value;
  } catch (error) {
    console.error(
      `course-site: ${stage}: ${project} — ошибка (${
        ((performance.now() - started) / 1000).toFixed(1)
      } с)`,
    );
    throw error;
  }
}
async function finalizeDownloads(
  ...args: Parameters<typeof finalizeDownloadsImpl>
) {
  return await progress(
    "Проверка и загрузки",
    args[0],
    () => finalizeDownloadsImpl(...args),
  );
}
async function finalizeDownloadsImpl(
  root: string,
  config: any,
  record: any,
  baseUrl: string | undefined,
  referenceCatalog: unknown,
  catalogBaseUrl: string | undefined,
  destinationDirectory?: string,
) {
  let catalog, release;
  const observeOperation = (value: any, proof: unknown) => {
    catalogCoverage(value, record);
    catalog = value;
    release = proof;
  };
  if (config["project-download"]) {
    const Download = await module("project-download", "public.ts", root);
    await Download.finishDownloads(root, {
      native: nativeCore(config),
      outputDirectory: record.outputDir,
      projection: projection(config),
      profiles: record.profiles,
      baseUrl,
      referenceCatalog,
      catalogBaseUrl,
      observeOperation,
      destinationDirectory,
    });
  } else if (nativeCore(config)) {
    const Core = await module("course-core", "public.ts", root);
    await Core.withCurrentNativeOperation(
      {
        root,
        profiles: record.profiles,
        projection: projection(config),
        outputDirectory: record.outputDir,
      },
      async (operation: any) => {
        catalogCoverage(operation.catalog, record);
        catalog = operation.catalog;
        release = await ownerRelease(
          root,
          operation,
          Core,
          record.selectedSources,
        );
      },
    );
  }
  return catalog ? { catalog, release } : undefined;
}
export async function pre(root = Deno.cwd()): Promise<void> {
  const state = statePath(root);
  await safePath(root, state);
  await Deno.mkdir(dirname(state), { recursive: true });
  await remove(state);
  const ws = await progress("Планирование корня", root, () => workspace(root));
  releaseQualification(ws.config, root);
  const audience = validateAudience(
    root,
    ws.profiles,
    ws.config.course?.view,
    nativeCore(ws.config) ? projection(ws.config) : undefined,
  );
  if (Deno.env.get("QUARTO_PROJECT_RENDER_ALL") !== "1") {
    if (ws.config["project-download"]) {
      await (await module("project-download", "public.ts")).prepareDownloads(
        root,
      );
    }
    await coreHook(root, ws.config, "pre");
    return;
  }
  const run = join(dirname(state), "runs", crypto.randomUUID());
  await Deno.mkdir(run, { recursive: true });
  await progress("Проверка аудиторий", root, () => validateAudienceOutputs(
    root,
    ws.profiles,
    ws.output,
    ws.config.course?.view,
    nativeCore(ws.config) ? projection(ws.config) : undefined,
    audience,
    { profiles: ws.profiles, config: ws.config },
  ));
  const publicationBase = ws.config.website?.["site-url"] ||
    ws.config["course-navigation"]?.["course-url"];
  if (ws.config["project-download"]?.["course-model"] && !publicationBase) {
    throw diagnostic(
      "SITE.PUBLICATION_REQUIRED",
      "Модельной выдаче требуется конечный URL композиции",
      { source: root, field: "website.site-url/course-navigation.course-url" },
    );
  }
  const inspected = [];
  // Validate all selected destinations before deleting any output.
  for (const project of ws.projects) {
    const plan = await progress("Планирование компонента", project.path, () =>
      inspectProject(project.path, ws.profiles)
    );
    const config = plan.config;
    releaseQualification(config, project.path);
    if (config["project-download"]?.["course-model"] && !publicationBase) {
      throw diagnostic(
        "SITE.PUBLICATION_REQUIRED",
        "Модельной выдаче компонента требуется конечный URL композиции",
        {
          source: project.path,
          field: "website.site-url/course-navigation.course-url",
        },
      );
    }
    if (typeof config.project?.["output-dir"] !== "string") {
      throw diagnostic(
        "SITE.CONFIG_INVALID",
        "Компоненту требуется native каталог результата",
        {
          source: project.path,
          id: project.id,
          field: "project.output-dir",
          hint: "Задайте project.output-dir в конфигурации компонента.",
        },
      );
    }
    const output = await outputDirectory(
      project.path,
      config.project["output-dir"],
    );
    await progress("Проверка аудиторий", project.path, () => validateAudienceOutputs(
      project.path,
      ws.profiles,
      output,
      config.course?.view,
      nativeCore(config) ? projection(config) : undefined,
      nativeCore(config) ? audience : undefined,
      { profiles: ws.profiles, config },
    ));
    inspected.push({ project, config, output, plan });
  }
  for (const { project, output } of inspected) {
    for (const other of ws.projects) {
      if (
        inside(output, other.path) ||
        inside(other.path, output) && other.path !== project.path
      ) {
        throw diagnostic(
          "SITE.OUTPUT_OVERLAP",
          "Результат компонента пересекается с источником другого компонента",
          {
            source: project.path,
            id: project.id,
            field: "project.output-dir",
            related: [{ source: output }, { source: other.path, id: other.id }],
            hint: "Разделите исходники и результаты проектов.",
          },
        );
      }
    }
    if (inside(output, ws.output) || inside(ws.output, output)) {
      throw diagnostic(
        "SITE.OUTPUT_OVERLAP",
        "Каталоги результата компонента и корня пересекаются",
        {
          source: project.path,
          id: project.id,
          field: "project.output-dir",
          related: [{ source: output }, { source: ws.output }],
          hint: "Выберите независимые каталоги результата.",
        },
      );
    }
  }
  await cleanOutput(root, ws.output, [
    ...ws.resources || [],
    ...inspected.flatMap(({ plan }) => plan.resources || []),
  ]);
  if (ws.config["project-download"]) {
    await (await module("project-download", "public.ts")).prepareDownloads(
      root,
    );
  }
  const records = [];
  for (const { project, config, output, plan } of inspected) {
    await cleanOutput(project.path, output, plan.resources);
    const collection = join(run, `${project.id}-0.json`);
    await progress("Рендер", project.path, () =>
      quarto(
        ["render", ".", "--to", project.to, ...profileArguments(ws.profiles)],
        project.path,
        {
          COURSE_SITE_COLLECTION: collection,
          COURSE_SITE_PROJECT: project.id,
          COURSE_SITE_DEFER_DOWNLOADS: "1",
          ...(publicationBase
            ? {
              COURSE_SITE_PUBLICATION_BASE: new URL(
                project.mount.replace(/\\/g, "/") + "/",
                publicationBase,
              ).href,
            }
            : {}),
        },
        true,
      ));
    const collected = await readCollection(
      collection,
      project.id,
      project.path,
      output,
      ws.profiles,
      true,
    );
    const record = {
      id: project.id,
      projectRoot: project.path,
      outputDir: output,
      profiles: collected.profiles,
      nativeOutputs: collected.nativeOutputs,
      files: collected.files,
      selectedSources: plan.selectedSources,
      to: project.to,
    };
    records.push({ project, config, record });
  }
  await Deno.writeTextFile(state, JSON.stringify({ ws, records, run }));
  await coreHook(root, ws.config, "pre");
}
export async function post(root = Deno.cwd()): Promise<void> {
  const state = statePath(root);
  if (Deno.env.get("QUARTO_PROJECT_RENDER_ALL") !== "1") {
    const ws = await workspace(root);
    const outputs = (Deno.env.has("QUARTO_PROJECT_OUTPUT_FILES") ||
        Deno.env.get("QUARTO_USE_FILE_FOR_PROJECT_OUTPUT_FILES"))
      ? await publicOutputs(root, ws.output)
      : [];
    if (!outputs.length) return;
    if (ws.config["reference-catalog"]) {
      const { publishReferenceCatalog: publish } = await module(
        "reference-catalog",
        "public.ts",
      );
      await publish({
        root,
        stage: ws.output,
        quarto: (await quarto(["--version"], root)).trim(),
        config: ws.config,
        members: [{
          namespace: ws.config["reference-catalog"].namespace,
          format: "html",
        }],
        scope: "local",
        outputs,
      });
    }
    await addressNavigation(ws.output, outputs);
    await coreHook(root, ws.config, "post");
    await finalizeDownloads(
      root,
      ws.config,
      {
        projectRoot: root,
        outputDir: ws.output,
        profiles: ws.profiles,
        nativeOutputs: outputs,
      },
      ws.config.website?.["site-url"] ||
        ws.config["course-navigation"]?.["course-url"],
      undefined,
      undefined,
    );
    return;
  }
  const { ws, records, run } = JSON.parse(await Deno.readTextFile(state));
  await remove(state);
  if (
    ws.root !== root ||
    ws.output !==
      resolve(root, Deno.env.get("QUARTO_PROJECT_OUTPUT_DIR") || ws.output)
  ) {
    throw diagnostic(
      "SITE.COLLECTION_INVALID",
      "Активная сборка не соответствует корню или каталогу результата",
      {
        source: root,
        field: "root/output",
        related: [{ source: ws.root }, { source: ws.output }],
        hint: "Запустите полную сборку заново.",
      },
    );
  }
  const rootOutputs = await publicOutputs(root, ws.output),
    rootFiles = await files(ws.output);
  const outputs = [...rootOutputs], searchIndexes: any[] = [];
  const rootSearch = join(ws.output, "search.json");
  if (rootFiles.includes(rootSearch)) {
    searchIndexes.push({ path: rootSearch, mount: "" });
  }
  const nativeOperations: any[] = [];
  const members = [];
  for (const { project, config, record } of records) {
    const mount = join(ws.output, project.mount);
    if (rootFiles.some((path: string) => inside(mount, path))) {
      throw diagnostic(
        "SITE.OUTPUT_OVERLAP",
        "Путь монтирования занят корневым результатом",
        {
          source: root,
          id: project.id,
          field: "subprojects",
          related: [{ source: mount }],
          hint: "Измените путь компонента или корневого ресурса.",
        },
      );
    }
    await safePath(root, mount);
    await Deno.mkdir(mount, { recursive: true });
    await copyFiles(record.outputDir, mount, record.files);
    outputs.push(
      ...record.nativeOutputs.map((path: string) =>
        join(mount, relative(record.outputDir, path))
      ),
    );
    if (record.files.includes(join(record.outputDir, "search.json"))) {
      searchIndexes.push({
        path: join(mount, "search.json"),
        mount: project.mount,
      });
    }
    if (config["reference-catalog"]) {
      members.push({
        namespace: config["reference-catalog"].namespace,
        format: record.nativeOutputs.some((path: string) =>
            path.endsWith(".html")
          )
          ? "html"
          : "nonweb",
      });
    }
  }
  if (ws.config["reference-catalog"]) {
    const { publishReferenceCatalog: publish } = await module(
      "reference-catalog",
      "public.ts",
    );
    const namespace = ws.config["reference-catalog"].namespace;
    if (namespace) members.push({ namespace, format: "html" });
    await publish({
      root,
      stage: ws.output,
      quarto: (await quarto(["--version"], root)).trim(),
      config: ws.config,
      members,
      scope: "full",
      outputs,
      searchIndexes,
    });
  }
  if (ws.config["course-navigation"]?.enabled === true) {
    const { composeNavigation } = await module(
      "course-navigation",
      "public.ts",
    );
    await composeNavigation({
      stage: ws.output,
      outputs,
      title: ws.config.website?.title || "Курс",
      members: [
        { id: "root", mount: "", title: ws.config.website?.title || "Курс" },
        ...records.filter(({ record }: any) =>
          record.nativeOutputs.some((path: string) => path.endsWith(".html"))
        ).map(({ project, config }: any) => ({
          id: project.id,
          mount: project.mount,
          title: config.book?.title || config.website?.title || project.mount,
        })),
      ],
    });
  } else {
    await addressNavigation(
      ws.output,
      outputs,
      true,
      ws.config["course-navigation"]?.["course-url"] ||
        ws.config.website?.["site-url"],
    );
  }
  await coreHook(root, ws.config, "post");
  const baseUrl = ws.config.website?.["site-url"] ||
    ws.config["course-navigation"]?.["course-url"];
  const catalogPath = join(ws.output, "reference-catalog.json");
  const referenceCatalog = ws.config["reference-catalog"]
    ? JSON.parse(await Deno.readTextFile(catalogPath))
    : undefined;
  for (const { project, config, record } of records) {
    const catalog = await finalizeDownloads(
      project.path,
      config,
      record,
      baseUrl
        ? new URL(project.mount.replace(/\\/g, "/") + "/", baseUrl).href
        : undefined,
      referenceCatalog,
      baseUrl,
      join(ws.output, project.mount),
    );
    if (catalog) nativeOperations.push({ project: project.mount, ...catalog });
  }
  const rootCatalog = await finalizeDownloads(
    root,
    ws.config,
    {
      projectRoot: root,
      outputDir: ws.output,
      profiles: ws.profiles,
      nativeOutputs: rootOutputs,
      selectedSources: ws.selectedSources,
    },
    baseUrl,
    referenceCatalog,
    baseUrl,
  );
  if (rootCatalog) {
    nativeOperations.push({ project: "root", ...rootCatalog });
  }
  await Deno.writeTextFile(
    join(run, "composition.json"),
    JSON.stringify({
      outputs,
      searchIndexes,
      nativeOperations,
      projects: records.map((r: any) => r.project.id),
    }),
  );
}

// @ts-expect-error JS допускает замену function binding; сигнатура публичного API сохраняется.
pre = __metrics.wrapAsync({
  id: "course-site.application.compose.pre",
  kind: "phase",
}, pre);
// @ts-expect-error JS допускает замену function binding; сигнатура публичного API сохраняется.
post = __metrics.wrapAsync({
  id: "course-site.application.compose.post",
  kind: "phase",
}, post);
