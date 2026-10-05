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
  inspect,
  validateAudienceOutputs,
  workspace,
} from "../infrastructure/config.ts";
import { profileArguments, quarto } from "../infrastructure/process.ts";
import { publicOutputs, readCollection } from "../infrastructure/collection.ts";
const siblings = dirname(dirname(dirname(fromFileUrl(import.meta.url))));
async function module(name: string, path: string): Promise<any> {
  try {
    return await import(toFileUrl(join(siblings, name, path)).href);
  } catch (e) {
    throw new Error(
      `course-site requires installed sibling ${name}/${path}: ${e}`,
    );
  }
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
async function beginCore(root: string, config: any) {
  if (config.course) {
    await (await module("course-core", "infrastructure/native-run.ts"))
      .beginNativeRun(root);
  }
}
export async function pre(root = Deno.cwd()): Promise<void> {
  const state = statePath(root);
  await safePath(root, state);
  await Deno.mkdir(dirname(state), { recursive: true });
  await remove(state);
  const ws = await workspace(root);
  if (Deno.env.get("QUARTO_PROJECT_RENDER_ALL") !== "1") {
    await beginCore(root, ws.config);
    return;
  }
  const run = join(dirname(state), "runs", crypto.randomUUID());
  await Deno.mkdir(run, { recursive: true });
  await validateAudienceOutputs(root, ws.profiles, ws.output);
  const inspected = [];
  // Validate all selected destinations before deleting any output.
  for (const project of ws.projects) {
    const config = await inspect(project.path, ws.profiles);
    if (typeof config.project?.["output-dir"] !== "string") {
      throw new Error(
        `course-site component ${project.id} requires a native output-dir`,
      );
    }
    const output = await outputDirectory(
      project.path,
      config.project["output-dir"],
    );
    await validateAudienceOutputs(project.path, ws.profiles, output);
    inspected.push({ project, config, output });
  }
  await cleanOutput(root, ws.output);
  await beginCore(root, ws.config);
  const records = [];
  for (const { project, config, output } of inspected) {
    await cleanOutput(project.path, output);
    if (config.course) {
      const completion = join(
        project.path,
        "_generated/course-spec/native-run.json",
      );
      await safePath(project.path, completion);
      await remove(completion);
    }
    const collection = join(run, `${project.id}.json`);
    await quarto(
      ["render", ".", "--to", project.format, ...profileArguments(ws.profiles)],
      project.path,
      { COURSE_SITE_COLLECTION: collection, COURSE_SITE_PROJECT: project.id },
      true,
    );
    const record = await readCollection(
      collection,
      project.id,
      project.path,
      output,
      ws.profiles,
    );
    records.push({ project, config, record });
  }
  await Deno.writeTextFile(state, JSON.stringify({ ws, records, run }));
}
function qualify(value: any, prefix: string): any {
  const topic = (exercise: any) => ({
    ...exercise,
    ...(exercise.sourceTopic
      ? {
        sourceTopic: {
          ...exercise.sourceTopic,
          rootQmd: `${prefix}/${exercise.sourceTopic.rootQmd}`,
        },
      }
      : {}),
  });
  return {
    ...value,
    source: `${prefix}/${value.source}`,
    ...(value.resources
      ? {
        resources: {
          ...value.resources,
          source: `${prefix}/${value.resources.source}`,
        },
      }
      : {}),
    ...(value.document
      ? {
        document: {
          ...value.document,
          source: `${prefix}/${value.document.source}`,
        },
      }
      : {}),
    ...(value.exercises ? { exercises: value.exercises.map(topic) } : {}),
    ...(value.body?.publicExercises
      ? {
        body: {
          ...value.body,
          publicExercises: value.body.publicExercises.map(topic),
        },
      }
      : {}),
  };
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
    if (ws.config.course) {
      await (await module("course-core", "infrastructure/native-run.ts"))
        .finishNativeRun(root);
    }
    if (ws.config["reference-catalog"]) {
      const { publish } = await module(
        "reference-catalog",
        "infrastructure/publish.ts",
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
    return;
  }
  const { ws, records, run } = JSON.parse(await Deno.readTextFile(state));
  await remove(state);
  if (
    ws.root !== root ||
    ws.output !==
      resolve(root, Deno.env.get("QUARTO_PROJECT_OUTPUT_DIR") || ws.output)
  ) throw new Error("course-site active root mismatch");
  const rootOutputs = await publicOutputs(root, ws.output),
    rootFiles = await files(ws.output);
  const outputs = [...rootOutputs], searchIndexes: any[] = [];
  const rootSearch = join(ws.output, "search.json");
  if (rootFiles.includes(rootSearch)) {
    searchIndexes.push({ path: rootSearch, mount: "" });
  }
  const native = [];
  if (ws.config.course) {
    native.push({
      prefix: "root",
      view: ws.config.course.view,
      run: await (await module("course-core", "infrastructure/native-run.ts"))
        .finishNativeRun(root),
    });
  }
  const members = [];
  for (const { project, config, record } of records) {
    const mount = join(ws.output, project.mount);
    if (rootFiles.some((path: string) => inside(mount, path))) {
      throw new Error(
        `course-site mount conflicts with root output: ${project.mount}`,
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
    if (config.course) {
      native.push({
        prefix: project.id,
        view: ws.config.course ? ws.config.course.view : config.course.view,
        run: await (await module("course-core", "infrastructure/native-run.ts"))
          .loadNativeRun(project.path, {
            profiles: ws.profiles,
            view: ws.config.course ? ws.config.course.view : config.course.view,
            outputDirectory: record.outputDir,
          }),
      });
    }
    if (config["reference-catalog"]) {
      members.push({
        namespace: config["reference-catalog"].namespace,
        format: project.format,
      });
    }
  }
  if (native.length) {
    const groups = new Map<
      string,
      {
        documents: any[];
        adapters: any[];
        view: "student" | "full" | undefined;
      }
    >();
    const sourceRoots: Record<string, string> = {};
    for (const item of native) {
      const emitted = new Set(
        item.run.documents.map((d: any) =>
          resolve(item.run.outputDirectory, d.document.output)
        ),
      );
      if (item.run.outputFiles.some((path: string) => !emitted.has(path))) {
        throw new Error("course-site required current Core result is missing");
      }
      for (const document of item.run.documents) {
        const id = document.course.id;
        const group = groups.get(id) ||
          { documents: [] as any[], adapters: [] as any[], view: item.view };
        if (group.view !== item.view) {
          throw new Error(
            `course-site inconsistent configured audience for ${id}`,
          );
        }
        group.documents.push(qualify(document, item.prefix));
        sourceRoots[`${item.prefix}/${document.source}`] = item.run.projectRoot;
        groups.set(id, group);
      }
      for (
        const id of new Set(item.run.documents.map((d: any) => d.course.id))
      ) {
        const group = groups.get(id as string)!;
        for (const adapter of item.run.adapters) {
          const fragments = new Map(
            [...adapter.fragments].filter(([, fragment]: any) =>
              fragment.course.id === id
            ).map((
              [source, fragment]: any,
            ) => [`${item.prefix}/${source}`, qualify(fragment, item.prefix)]),
          );
          const existing = group.adapters.find((a: any) =>
            a.contract.name === adapter.contract.name
          );
          if (existing) {
            for (const [source, fragment] of fragments) {
              existing.fragments.set(source, fragment);
            }
          } else group.adapters.push({ ...adapter, fragments });
        }
      }
    }
    const { assembleRelease } = await module(
      "course-core",
      "domain/release.ts",
    );
    for (const [id, group] of groups) {
      const release = assembleRelease(
        group.documents.map((d: any) => d.source),
        group.documents,
        group.adapters,
        { view: group.view, profiles: ws.profiles },
      );
      await (await module("course-core", "infrastructure/validate.ts"))
        .validateRelease(release, root, group.adapters, sourceRoots);
      await Deno.writeTextFile(
        join(run, `${encodeURIComponent(id)}-release.json`),
        JSON.stringify(release),
      );
    }
  }
  if (ws.config["reference-catalog"]) {
    const { publish } = await module(
      "reference-catalog",
      "infrastructure/publish.ts",
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
  await Deno.writeTextFile(
    join(run, "composition.json"),
    JSON.stringify({
      outputs,
      searchIndexes,
      projects: records.map((r: any) => r.project.id),
    }),
  );
}
