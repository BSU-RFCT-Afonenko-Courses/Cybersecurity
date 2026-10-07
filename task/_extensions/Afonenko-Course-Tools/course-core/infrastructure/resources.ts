import { diagnostic } from "../domain/diagnostics.ts";
import { dirname, relative, resolve } from "stdlib/path";
import { child } from "./files.ts";
export interface ResourceFacts {
  source: string;
  format: string;
  view?: "student" | "full";
  effectiveBase: string;
  outputDirectory: string;
  outputFile: string;
  rawUses: string[];
  projectedUses: string[];
  /** Current raw exercise project roots: exclusion policy only, including hidden declarations. */
  rawProjectRoots?: string[];
  /** Current filter observations; output is the native writer destination. */
  capturedFiles?: {
    source: string;
    output: string;
    sha1: string;
    capture?: string;
  }[];
}
/** Lua native paths may retain dot segments; compare one filesystem spelling. */
export function normalizeResourceFacts(fact: ResourceFacts): ResourceFacts {
  return {
    ...fact,
    effectiveBase: resolve(fact.effectiveBase),
    outputDirectory: resolve(fact.outputDirectory),
    rawProjectRoots: fact.rawProjectRoots?.map((path) => resolve(path)),
    capturedFiles: fact.capturedFiles?.map((file) => ({
      ...file,
      source: resolve(file.source),
      output: resolve(file.output),
      ...(file.capture ? { capture: resolve(file.capture) } : {}),
    })),
  };
}
export interface ResourceFile {
  source: string;
  path: string;
  target: string;
  effectiveBase: string;
}
const local = (s: string) => s && !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(s);
const clean = (s: string) => decodeURIComponent(s.split(/[?#]/)[0]);
const service = (s: string, publicPayload = false) =>
  /(^|\/)(?:\.[^/]+|_extensions|_freeze|_generated)(\/|$)/.test(s) ||
  /(^|\/)(?:_quarto(?:[-.]|$)|_metadata\.ya?ml$)/i.test(s) ||
  /\.(?:qmd|rmd|ipynb)$/i.test(s) ||
  !publicPayload && /\.(?:ya?ml|lua|ts|cue|r|py|sh|toml)$/i.test(s);

async function digest(path: string) {
  const bytes = await Deno.readFile(path);
  return [...new Uint8Array(await crypto.subtle.digest("SHA-1", bytes))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function capturedPath(root: string, fact: ResourceFacts, source: string) {
  const captured = fact.capturedFiles?.find((file) => file.source === source);
  if (!captured) return await Deno.realPath(source);
  child(root, captured.source);
  child(root, captured.output);
  child(fact.outputDirectory, captured.output);
  let captureRoot: string | undefined;
  const candidates = [captured.source, captured.output];
  if (captured.capture && fact.format === "latex") {
    child(root, captured.capture);
    const marker = "/_generated/course-spec/";
    const offset = captured.capture.lastIndexOf(marker);
    if (
      offset < 0 ||
      !/^(?:native-runs|document-resources)\//.test(
        captured.capture.slice(offset + marker.length),
      )
    ) throw diagnostic("RESOURCE.CAPTURE_PATH_INVALID", "Недопустимый путь сохранённых байтов ресурса", {source: fact.source, field: "resource"});
    captureRoot = captured.capture.slice(0, offset) + "/_generated/course-spec";
    child(captureRoot, captured.capture);
    candidates.push(captured.capture);
  }
  for (const candidate of [...new Set(candidates)]) {
    try {
      const real = await Deno.realPath(candidate);
      child(root, real);
      if (candidate === captured.capture) child(captureRoot!, real);
      if (await digest(real) === captured.sha1) return real;
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
  }
  throw diagnostic("RESOURCE.CURRENT_BYTES_MISSING", "Текущие байты ресурса не найдены: " + source, {source: fact.source, field: "resource"});
}
const usePath = (root: string, fact: ResourceFacts, use: string) =>
  use.startsWith("/")
    ? resolve(root, clean(use).slice(1))
    : resolve(fact.effectiveBase, clean(use));

/** Protect only service siblings of declared exercise projects, not student/tests. */
async function projectBoundaries(root: string, facts: ResourceFacts[]) {
  const directories = new Set<string>(), files = new Set<string>();
  const containedReal = async (path: string) => {
    child(root, path);
    try {
      return child(root, await Deno.realPath(path));
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
  };
  for (
    const path of new Set(facts.flatMap((fact) => fact.rawProjectRoots || []))
  ) {
    const real = await containedReal(path);
    for (const base of new Set([path, ...(real ? [real] : [])])) {
      for (
        const name of [
          "reference",
          "solution",
          "solutions",
          "tests",
          "closed-tests",
        ]
      ) {
        const directory = resolve(base, name);
        directories.add(directory);
        const physical = await containedReal(directory);
        if (physical) directories.add(physical);
      }
      const file = resolve(base, "check.sh");
      files.add(file);
      const physical = await containedReal(file);
      if (physical) files.add(physical);
    }
  }
  return (path: string) =>
    files.has(path) ||
    [...directories].some((directory) =>
      path === directory || path.startsWith(directory + "/")
    );
}

/** Remove only observed hidden-only native copies; never input files or caches. */
export async function cleanHiddenResourceOutputs(
  root: string,
  facts: ResourceFacts[],
) {
  facts = facts.map(normalizeResourceFacts);
  const visible = new Set<string>();
  for (const fact of facts) {
    const uses = new Set(
      (fact.view === "full" ? fact.rawUses : fact.projectedUses).filter(local)
        .map((u) => usePath(root, fact, u)),
    );
    for (const file of fact.capturedFiles || []) {
      if (!uses.has(file.source)) continue;
      visible.add(file.output);
      try {
        visible.add(await Deno.realPath(file.output));
      } catch (e) {
        if (!(e instanceof Deno.errors.NotFound)) throw e;
      }
    }
  }
  for (const fact of facts) {
    if (fact.view === "full") continue;
    for (const file of fact.capturedFiles || []) {
      if (visible.has(file.output) || file.output === file.source) continue;
      child(root, file.output);
      child(fact.outputDirectory, file.output);
      try {
        const real = await Deno.realPath(file.output);
        child(fact.outputDirectory, real);
        child(root, real);
        if (visible.has(real) || real === file.source) continue;
        if (await digest(real) !== file.sha1) {
          throw diagnostic("RESOURCE.CURRENT_BYTES_MISMATCH", "Байты ресурса изменились после текущего рендера: " + file.output, {source: fact.source, field: "resource"});
        }
        await Deno.remove(file.output);
      } catch (e) {
        if (!(e instanceof Deno.errors.NotFound)) throw e;
      }
    }
  }
}

/** Called only after the document was matched to the current native output. */
export async function validateCapturedResources(
  root: string,
  fact: ResourceFacts,
) {
  fact = normalizeResourceFacts(fact);
  await projectBoundaries(root, [fact]);
  const selected = new Set(
    (fact.view === "full" ? fact.rawUses : fact.projectedUses).filter(local)
      .map((u) => usePath(root, fact, u)),
  );
  for (const file of fact.capturedFiles || []) {
    if (selected.has(file.source)) await capturedPath(root, fact, file.source);
  }
}
export async function evaluateResources(
  options: {
    facts: ResourceFacts[];
    selected: string[];
    availableFiles?: string[];
    projectRoot: string;
    /** Explicitly selected starter payloads, with known authored inputs excluded. */
    publicPayload?: boolean;
    authoredInputs?: string[];
  },
): Promise<{ files: ResourceFile[]; diagnostics: string[] }> {
  const facts = options.facts.map(normalizeResourceFacts);
  const root = await Deno.realPath(options.projectRoot),
    raw = new Set<string>(),
    visible = new Set<string>();
  const resolveUse = (f: ResourceFacts, s: string) =>
    s.startsWith("/")
      ? resolve(root, clean(s).slice(1))
      : resolve(f.effectiveBase, clean(s));
  for (const f of facts) {
    for (const s of f.rawUses.filter(local)) raw.add(resolveUse(f, s));
    for (const s of f.projectedUses.filter(local)) {
      visible.add(resolveUse(f, s));
    }
  }
  const physical = async (paths: Set<string>) => {
    const result = new Set<string>();
    for (const path of paths) {
      try {
        result.add(await Deno.realPath(path));
      } catch (error) {
        if (!(error instanceof Deno.errors.NotFound)) throw error;
      }
    }
    return result;
  };
  const protectedProjectPath = await projectBoundaries(root, facts);
  const authored = new Set([
    ...facts.map((f) => f.source),
    ...options.authoredInputs || [],
  ].map((s) => resolve(root, s)));
  const authoredPhysical = await physical(authored);
  const rawPhysical = await physical(raw),
    visiblePhysical = await physical(visible);
  // Include native destinations in alias checks after Quarto moves generated files.
  for (const fact of facts) {
    for (
      const [uses, physicalPaths] of [[fact.rawUses, rawPhysical], [
        fact.projectedUses,
        visiblePhysical,
      ]] as const
    ) {
      for (const use of uses.filter(local)) {
        const source = resolveUse(fact, use);
        if (fact.capturedFiles?.some((file) => file.source === source)) {
          try {
            physicalPaths.add(await capturedPath(root, fact, source));
          } catch (error) {
            // Hidden copies may have been removed by the current post-render cleanup.
            if (
              physicalPaths === visiblePhysical || !(error instanceof Error) ||
              !error.message.startsWith("RESOURCE.CURRENT_BYTES_MISSING:")
            ) throw error;
          }
        }
      }
    }
  }
  const files: ResourceFile[] = [];
  for (const selected of [...new Set(options.selected)]) {
    if (!local(selected)) continue;
    const path = child(
      root,
      selected.startsWith("/") ? selected.slice(1) : clean(selected),
    );
    const name = relative(root, path).replaceAll("\\", "/");
    if (
      service(name, options.publicPayload) || protectedProjectPath(path) ||
      authored.has(path) ||
      raw.has(path) && !visible.has(path)
    ) {
      throw diagnostic("RESOURCE.PRIVATE_OR_SOURCE", "Закрытый, служебный или исходный файл нельзя включать в публичный ресурс: " + selected, {source: selected, field: "resource"});
    }
    const fact = facts.find((f) =>
      f.projectedUses.some((u) => local(u) && resolveUse(f, u) === path)
    );
    const real = fact
      ? await capturedPath(root, fact, path)
      : await Deno.realPath(path);
    child(root, real);
    const captured = fact?.capturedFiles?.find((file) => file.source === path);
    const isTransport = fact?.format === "latex" && captured?.capture &&
      await Deno.realPath(captured.capture) === real;
    if (
      !isTransport && service(
          relative(root, real).replaceAll("\\", "/"),
          options.publicPayload,
        ) ||
      protectedProjectPath(real) || authoredPhysical.has(real) ||
      rawPhysical.has(real) && !visiblePhysical.has(real)
    ) throw diagnostic("RESOURCE.PRIVATE_OR_SOURCE", "Закрытый, служебный или исходный файл нельзя включать в публичный ресурс: " + selected, {source: selected, field: "resource"});
    if (!(await Deno.stat(real)).isFile) {
      throw diagnostic("RESOURCE.NOT_FILE", "Выбранный ресурс не является файлом: " + selected, {source: selected, field: "resource"});
    }
    if (
      options.availableFiles &&
      !options.availableFiles.map((x) => resolve(root, x)).includes(path)
    ) throw diagnostic("RESOURCE.NOT_AVAILABLE", "Ресурс отсутствует среди доступных файлов текущей сборки: " + selected, {source: selected, field: "resource"});
    files.push({
      source: fact?.source || name,
      path: real,
      target: name,
      effectiveBase: fact?.effectiveBase || dirname(path),
    });
  }
  return { files, diagnostics: [] };
}
