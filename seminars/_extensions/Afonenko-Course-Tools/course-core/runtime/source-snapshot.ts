import { dirname, join, relative, resolve } from "stdlib/path";
import { quartoOutputNames } from "../infrastructure/generated-paths.ts";
import {
  toolCacheContainer,
  toolCachePath,
} from "../infrastructure/tool-cache.ts";
import { fail } from "../contracts/project.ts";
// @deno-types="../vendor/zod/v4/index.d.ts"
import { z } from "../vendor/zod/v4/index.js";
export type SourceSnapshotState = {
  root: string;
  outputDirectory: string;
  rows: { path: string; signature: string; sha256: string }[];
  memberships: Record<string, string[]>;
  relevantInputs: string[];
  metrics: {
    fullWalks: number;
    sourceDirectoryReads: number;
    sourceHashReads: number;
    sourceHashBytes?: number;
    fullSourceFences: number;
    localSourceFences: number;
  };
};
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
const pathSchema = z.string().min(1).refine((s) =>
  !s.startsWith("/") && !s.includes("\\") && !s.includes("\0") &&
  s.split("/").every((p) => p && p !== "." && p !== "..")
);
export const signature = (s: Deno.FileInfo) =>
  JSON.stringify([
    s.dev,
    s.ino,
    s.mode,
    s.size,
    s.mtime?.getTime(),
    s.ctime?.getTime(),
    s.isFile,
    s.isDirectory,
    s.isSymlink,
  ]);
export async function ownedPhysical(root: string, path: string) {
  if (!pathSchema.safeParse(path).success) {
    fail("RESOURCE_PATH", "Нужен canonical путь внутри owner");
  }
  let current = root;
  for (const part of path.split("/")) {
    current = join(current, part);
    if ((await Deno.lstat(current)).isSymlink) {
      fail("OPERATION_CHANGED", "Символическая ссылка в native operation");
    }
  }
  if (await Deno.realPath(current) !== current) {
    fail("OPERATION_CHANGED", "Неканонический native path");
  }
  return current;
}
export async function regular(root: string, path: string) {
  const current = await ownedPhysical(root, path);
  if (!(await Deno.lstat(current)).isFile) {
    fail("OPERATION_CHANGED", "Нужен regular native file");
  }
  return current;
}
export async function hash(bytes: Uint8Array, algorithm = "SHA-256") {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest(algorithm, new Uint8Array(bytes)),
    ),
  ].map((v) => v.toString(16).padStart(2, "0")).join("");
}
export function excluded(
  state: Pick<SourceSnapshotState, "root" | "outputDirectory">,
  path: string,
) {
  const name = relative(state.root, path);
  return path === state.outputDirectory || toolCachePath(state.root, path) ||
    name.split("/").some((p) =>
      [
        ...quartoOutputNames,
        ".git",
        ".quarto",
        "_generated",
        "node_modules",
        ".gradle",
        "build",
      ]
        .includes(p)
    );
}
export async function snapshot(state: SourceSnapshotState) {
  state.metrics.fullWalks++;
  async function walk(dir: string) {
    const names: string[] = [];
    state.metrics.sourceDirectoryReads++;
    for await (const e of Deno.readDir(dir)) {
      const p = join(dir, e.name);
      if (excluded(state, p)) continue;
      if (e.isSymlink || !(e.isFile || e.isDirectory)) {
        fail(
          "OPERATION_UNQUALIFIED",
          "Native source symlink/special entry не квалифицирован",
        );
      }
      names.push(e.name);
      if (e.isDirectory) await walk(p);
      else {
        const signatureBefore = signature(await Deno.lstat(p));
        const bytes = await Deno.readFile(p);
        state.metrics.sourceHashReads++;
        if (typeof state.metrics.sourceHashBytes !== "number") {
          fail(
            "METRICS_UNAVAILABLE",
            "Fresh S requires sourceHashBytes counter",
          );
        }
        state.metrics.sourceHashBytes += bytes.length;
        if (signature(await Deno.lstat(p)) !== signatureBefore) {
          fail("OPERATION_CHANGED", "Source изменён при snapshot");
        }
        state.rows.push({
          path: relative(state.root, p),
          signature: signatureBefore,
          sha256: await hash(bytes),
        });
      }
    }
    state.memberships[relative(state.root, dir)] = names.sort();
  }
  await walk(state.root);
}
// Индексы живут только вместе с private S, не сериализуются и не обнаруживают новые пути.
const indexes = new WeakMap<SourceSnapshotState, {
  rows: Map<string, SourceSnapshotState["rows"][number]>;
  directories: Map<string, Set<string>>;
}>();
export function sourceIndex(state: SourceSnapshotState) {
  let index = indexes.get(state);
  if (!index) {
    index = {
      rows: new Map(state.rows.map((row) => [row.path, row])),
      directories: new Map(
        Object.entries(state.memberships).map((
          [path, names],
        ) => [path, new Set(names)]),
      ),
    };
    indexes.set(state, index);
  }
  return index;
}
export async function assertSources(
  state: SourceSnapshotState,
  additions: readonly string[] = [],
  full = true,
  selectedInputs: readonly string[] = state.relevantInputs,
) {
  if (full) state.metrics.fullSourceFences++;
  else state.metrics.localSourceFences++;
  const index = sourceIndex(state);
  const directories = new Set(
    selectedInputs.map((p) => dirname(p) === "." ? "" : dirname(p)),
  );
  for (const input of selectedInputs) {
    if (Object.hasOwn(state.memberships, input)) directories.add(input);
    let directory = dirname(input);
    while (directory !== ".") {
      directories.add(directory);
      directory = dirname(directory);
    }
    directories.add("");
  }
  // Общие предки проверяются один раз на границу, включая пустые каталоги.
  const physical = new Map<string, Deno.FileInfo>();
  const inspectPath = async (path: string) => {
    let current = state.root;
    let info: Deno.FileInfo | undefined;
    for (const part of path.split("/")) {
      current = join(current, part);
      info = physical.get(current);
      if (!info) {
        info = await Deno.lstat(current);
        if (info.isSymlink || await Deno.realPath(current) !== current) {
          fail("OPERATION_CHANGED", "Неканонический native source path");
        }
        physical.set(current, info);
      }
    }
    return info!;
  };
  const rows = full
    ? state.rows
    : [...new Set(selectedInputs)].flatMap((path) => {
      const row = index.rows.get(path);
      return row ? [row] : [];
    });
  for (const row of rows) {
    const info = await inspectPath(row.path);
    if (!info.isFile || signature(info) !== row.signature) {
      fail("OPERATION_CHANGED", "Native source изменён: " + row.path);
    }
  }
  const allowed = new Set(additions);
  const allowedParents = new Set<string>();
  for (const path of additions) {
    let parent = dirname(path);
    while (parent !== ".") {
      allowedParents.add(parent);
      parent = dirname(parent);
    }
  }
  const selectedDirectories = full ? index.directories.keys() : directories;
  for (const dir of selectedDirectories) {
    const names = state.memberships[dir], known = index.directories.get(dir);
    if (!names || !known) continue;
    if (dir && !(await inspectPath(dir)).isDirectory) {
      fail("OPERATION_CHANGED", "Native source directory type изменён");
    }
    const current: string[] = [];
    state.metrics.sourceDirectoryReads++;
    for await (const entry of Deno.readDir(join(state.root, dir))) {
      const path = join(state.root, dir, entry.name);
      if (excluded(state, path)) continue;
      if (
        !known.has(entry.name) &&
        await toolCacheContainer(state.root, path)
      ) continue;
      const local = relative(state.root, path);
      if (
        !known.has(entry.name) &&
        (allowed.has(local) || allowedParents.has(local))
      ) continue;
      current.push(entry.name);
    }
    if (!same(current.sort(), names)) {
      fail("OPERATION_CHANGED", "Изменён состав native source: " + dir);
    }
  }
}
