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
async function inspect(root: string) {
  const executable = Deno.env.get("QUARTO") ||
    Deno.env.get("QUARTO_BIN_PATH") &&
      join(Deno.env.get("QUARTO_BIN_PATH")!, "quarto") ||
    "quarto";
  const result = await new Deno.Command(executable, {
    args: ["inspect", root],
    cwd: root,
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!result.success) throw new Error(new TextDecoder().decode(result.stderr));
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
    throw new Error("Каталог вывода не должен быть символической ссылкой");
  }
  await noSymlinks(outputRoot, directory);
  const manifest = join(directory, manifestName);
  if (!await exists(manifest)) return;
  await noSymlinks(outputRoot, manifest);
  const files = JSON.parse(await Deno.readTextFile(manifest));
  if (
    !Array.isArray(files) ||
    files.some((name) => typeof name !== "string" || !archiveName(name))
  ) throw new Error("Повреждён перечень файлов project-download");
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
    for await (const entry of Deno.readDir(directory)) {
      if (entry.isFile && entry.name.endsWith(".json")) {
        const request: Request = JSON.parse(
          await Deno.readTextFile(join(directory, entry.name)),
        );
        if (selected.has(request.source)) requests.push(request);
      }
    }
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
    current = { run: await loadNativeRun(root), evaluateResources };
  }
  if (
    current &&
    (resolve(current.run.projectRoot) !== resolve(root) ||
      resolve(current.run.outputDirectory) !== resolve(root, output))
  ) {
    throw Error(
      "Download native context does not match current project/output",
    );
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
          throw Error(
            "Download request has no current native document: " +
              request.source,
          );
        }
      }
      return requests;
    },
    async courseResource(id, source): Promise<Resource> {
      const document = current?.run.documents.find((d) => d.source === source);
      const exercise = (document?.body?.publicExercises ??
        (document?.course.view === "full" ? [] : document?.exercises ?? []))
        .find((item: any) => item.id === id);
      if (!exercise?.project) {
        throw new Error(
          `В текущем native документе отсутствует публичное задание с проектом: ${id}`,
        );
      }
      return { path: exercise.project.replace(/\/$/, "") + "/student" };
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
        ) throw Error("RESOURCE.PRIVATE_OR_SOURCE: " + file.name);
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
      await clearOwned(root, output);
      if (!archives.length) return;
      const outputRoot = resolve(root, output);
      const directory = child(outputRoot, "_downloads");
      await Deno.mkdir(directory, { recursive: true });
      if ((await Deno.lstat(outputRoot)).isSymlink) {
        throw new Error("Каталог вывода не должен быть символической ссылкой");
      }
      await noSymlinks(outputRoot, directory);
      // Нельзя перезаписывать файл, которым это расширение не владело.
      for (const archive of archives) {
        if (await exists(join(directory, archive.name))) {
          throw new Error(
            `Посторонний файл мешает публикации архива: ${archive.name}`,
          );
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
    },
  });
}
