import { isAbsolute, join, relative, resolve } from "stdlib/path";
import type {
  Adapter,
  AdapterFragment,
  DocumentResult,
} from "../domain/model.ts";
import { child, exists } from "./files.ts";
import {
  cleanHiddenResourceOutputs,
  normalizeResourceFacts,
  validateCapturedResources,
} from "./resources.ts";
export interface NativeRunPointer {
  schema: "course-native-run-pointer-v1";
  directory: string;
  projectRoot: string;
  profiles: string[];
  outputDirectory: string;
  initialInputFiles?: string[];
  renderAll: boolean;
}
export interface NativeRun {
  schema: "course-native-run-v1";
  renderAll: boolean;
  projectRoot: string;
  outputDirectory: string;
  profiles: string[];
  documents: DocumentResult[];
  adapters: Adapter[];
  outputFiles: string[];
  inputFiles: string[];
}
export interface NativeRunExpectation {
  profiles?: string[];
  view?: "student" | "full";
  outputDirectory?: string;
}
const base = (root: string) => join(root, "_generated/course-spec");
const read = async (path: string) => JSON.parse(await Deno.readTextFile(path));
const profiles = () =>
  (Deno.env.get("QUARTO_PROFILE") || "").split(/[, ]+/).filter(Boolean);
async function contained(root: string, path: string) {
  const real = await Deno.realPath(path);
  if (real !== root) child(root, real);
  return real;
}
async function pointer(root: string): Promise<NativeRunPointer> {
  const p = await read(join(base(root), "active-native-run.json"));
  if (p.schema !== "course-native-run-pointer-v1" || p.projectRoot !== root) {
    throw Error("NATIVE.RUN_POINTER_INVALID");
  }
  child(join(base(root), "native-runs"), p.directory);
  await contained(root, p.directory);
  return p;
}
async function list(root: string, key: string) {
  const mode = Deno.env.get(
    key.replace("QUARTO_PROJECT_", "QUARTO_USE_FILE_FOR_PROJECT_"),
  );
  const content = mode
    ? await Deno.readTextFile(mode)
    : Deno.env.get(key) || "";
  const values = content.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  return [...new Set(values.map((path) => resolve(root, path)))];
}
export async function currentNativeOutputs(
  projectRoot: string,
): Promise<string[]> {
  return await list(projectRoot, "QUARTO_PROJECT_OUTPUT_FILES");
}
export async function beginNativeRun(
  projectRoot: string,
): Promise<NativeRunPointer> {
  const root = await Deno.realPath(projectRoot),
    outputDirectory = resolve(
      root,
      Deno.env.get("QUARTO_PROJECT_OUTPUT_DIR") || ".",
    );
  if (outputDirectory !== root) child(root, outputDirectory);
  await Deno.mkdir(base(root), { recursive: true });
  await contained(root, base(root));
  for (
    const name of ["native-run.json", "course.json", "course-candidate.json"]
  ) {
    const path = join(base(root), name);
    if (await exists(path)) await Deno.remove(path);
  }
  const runs = join(base(root), "native-runs");
  await Deno.mkdir(runs, { recursive: true });
  await contained(root, runs);
  if (await exists(outputDirectory)) await contained(root, outputDirectory);
  const directory = join(runs, crypto.randomUUID());
  await Deno.mkdir(join(directory, "documents"), { recursive: true });
  await Deno.mkdir(join(directory, "adapters"));
  const p: NativeRunPointer = {
    schema: "course-native-run-pointer-v1",
    projectRoot: root,
    directory,
    profiles: profiles(),
    outputDirectory,
    initialInputFiles: await list(root, "QUARTO_PROJECT_INPUT_FILES"),
    renderAll: Deno.env.get("QUARTO_PROJECT_RENDER_ALL") === "1",
  };
  await Deno.writeTextFile(
    join(base(root), "active-native-run.json"),
    JSON.stringify(p),
  );
  return p;
}
export async function finishNativeRun(projectRoot: string): Promise<NativeRun> {
  const root = await Deno.realPath(projectRoot), p = await pointer(root);
  const complete = join(base(root), "native-run.json");
  if (await exists(complete)) await Deno.remove(complete);
  if (JSON.stringify(p.profiles) !== JSON.stringify(profiles())) {
    throw Error("NATIVE.PROFILES_CHANGED");
  }
  const outputFiles = await currentNativeOutputs(root);
  if (!outputFiles.length) throw Error("NATIVE.NO_CURRENT_OUTPUTS");
  for (const path of outputFiles) {
    if (path !== p.outputDirectory) child(p.outputDirectory, path);
    await contained(root, path);
    if (!(await Deno.stat(path)).isFile) {
      throw Error("NATIVE.OUTPUT_NOT_FILE: " + path);
    }
  }
  const documents: DocumentResult[] = [];
  const intermediateOutputs = new Map<string, string>();
  for await (const e of Deno.readDir(join(p.directory, "documents"))) {
    if (!e.isFile || !e.name.endsWith(".json")) continue;
    const d: DocumentResult = await read(
      join(p.directory, "documents", e.name),
    );
    if (
      d.scope !== "document" || d.source !== d.document?.source ||
      JSON.stringify(d.document.profiles) !== JSON.stringify(p.profiles)
    ) throw Error("NATIVE.DOCUMENT_INVALID");
    const input = child(root, d.source);
    let out = child(p.outputDirectory, d.document.output);
    await contained(root, input);
    // Pandoc reports the native LaTeX intermediate before Quarto builds the PDF.
    // Bind only its exact final stem present in this process's public inventory.
    if (
      !outputFiles.includes(out) && d.document.format === "latex" &&
      /\.tex$/i.test(out)
    ) {
      const pdf = out.replace(/\.tex$/i, ".pdf");
      if (outputFiles.includes(pdf)) {
        intermediateOutputs.set(
          d.source + "\0" + d.document.format,
          d.document.output,
        );
        d.document.output = relative(p.outputDirectory, pdf).replaceAll(
          "\\",
          "/",
        );
        out = pdf;
      }
    }
    if (!outputFiles.includes(out)) {
      throw Error("NATIVE.DOCUMENT_NOT_CURRENT: " + d.source);
    }
    if (
      documents.some((x) =>
        x.source === d.source && x.document.format === d.document.format
      )
    ) throw Error("NATIVE.DUPLICATE_DOCUMENT");
    if (d.resources) {
      d.resources = normalizeResourceFacts(d.resources);
      if (
        d.resources.source !== d.source ||
        resolve(d.resources.outputDirectory) !== p.outputDirectory
      ) {
        throw Error("NATIVE.RESOURCE_CONTEXT_INVALID");
      }
      for (const file of d.resources.capturedFiles || []) {
        if (file.capture) {
          await contained(p.directory, child(p.directory, file.capture));
        }
      }
      await validateCapturedResources(root, d.resources);
    }
    documents.push(d);
  }
  if (documents.length) {
    for (const output of outputFiles) {
      if (
        /\.html?$/i.test(output) &&
        !documents.some((d) =>
          resolve(p.outputDirectory, d.document.output) === output
        )
      ) throw Error("NATIVE.MISSING_DOCUMENT: " + output);
    }
  }
  await cleanHiddenResourceOutputs(
    root,
    documents.flatMap((d) => d.resources ? [d.resources] : []),
  );
  const inputFiles = documents.length
    ? documents.map((d) => resolve(root, d.source))
    : p.initialInputFiles || [];
  const adapters: Adapter[] = [];
  for await (const e of Deno.readDir(join(p.directory, "adapters"))) {
    if (!e.isDirectory) continue;
    const dir = join(p.directory, "adapters", e.name),
      c = await read(join(dir, "contract.json"));
    if (
      c.name !== e.name || typeof c.rules !== "string" ||
      typeof c.directory !== "string"
    ) throw Error("NATIVE.ADAPTER_CONTRACT_INVALID");
    child(c.directory, c.rules);
    await contained(root, c.directory);
    const fragments = new Map<string, AdapterFragment>();
    for await (const f of Deno.readDir(dir)) {
      if (
        !f.isFile || f.name === "contract.json" || !f.name.endsWith(".json")
      ) continue;
      const v = await read(join(dir, f.name));
      const d = documents.find((x) => x.source === v.source);
      if (
        d && intermediateOutputs.has(d.source + "\0" + d.document.format) &&
        v.document?.output ===
          intermediateOutputs.get(d.source + "\0" + d.document.format)
      ) {
        v.document.output = d.document.output;
      }
      if (
        !d || v.document?.source !== d.document.source ||
        v.document?.format !== d.document.format ||
        v.document?.output !== d.document.output ||
        JSON.stringify(v.document?.profiles) !==
          JSON.stringify(d.document.profiles) ||
        v.course?.id !== d.course.id || v.course?.view !== d.course.view ||
        v.adapter !== c.name || fragments.has(v.source)
      ) throw Error("NATIVE.ADAPTER_NOT_CURRENT");
      fragments.set(v.source, v);
    }
    adapters.push({
      directory: c.directory,
      contract: { name: c.name, rules: c.rules },
      fragments,
    });
  }
  const run: NativeRun = {
    schema: "course-native-run-v1",
    renderAll: p.renderAll,
    projectRoot: root,
    outputDirectory: p.outputDirectory,
    profiles: p.profiles,
    documents,
    adapters,
    outputFiles,
    inputFiles,
  };
  const serialized = JSON.stringify({
    ...run,
    directory: p.directory,
    adapters: adapters.map((a) => ({
      ...a,
      fragments: [...a.fragments.values()],
    })),
  });
  await Deno.writeTextFile(join(p.directory, "native-run.json"), serialized);
  await Deno.writeTextFile(join(base(root), "native-run.json"), serialized);
  return run;
}
export async function loadNativeRun(
  projectRoot: string,
  expectation: NativeRunExpectation = {},
): Promise<NativeRun> {
  const root = await Deno.realPath(projectRoot),
    p = await pointer(root),
    run = await read(join(base(root), "native-run.json"));
  if (
    run.schema !== "course-native-run-v1" || run.directory !== p.directory ||
    run.projectRoot !== root
  ) throw Error("NATIVE.RUN_NOT_CURRENT");
  if (
    expectation.profiles &&
      JSON.stringify(expectation.profiles) !== JSON.stringify(run.profiles) ||
    expectation.view &&
      run.documents.some((d: DocumentResult) =>
        d.course.view !== expectation.view
      ) ||
    expectation.outputDirectory &&
      resolve(root, expectation.outputDirectory) !== run.outputDirectory
  ) throw Error("NATIVE.EXPECTATION_MISMATCH");
  run.adapters = run.adapters.map((a: any) => ({
    ...a,
    fragments: new Map(a.fragments.map((f: AdapterFragment) => [f.source, f])),
  }));
  return run;
}
