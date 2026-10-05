import { isAbsolute, join, relative, resolve } from "stdlib/path";
import type { Course, Json } from "../domain/model.ts";
export async function exists(path: string): Promise<boolean> {
  try { await Deno.stat(path); return true; } catch(e) { if (e instanceof Deno.errors.NotFound) return false; throw e; }
}
export async function fragments<T extends { source: string }>(root: string, name: string, selected: string[]): Promise<Map<string, T>> {
  const directory = join(root, "_generated/course-spec", name), result = new Map<string, T>();
  if (!await exists(directory)) return result;
  for await (const entry of Deno.readDir(directory)) {
    if (!entry.isFile || !entry.name.endsWith(".json")) continue;
    const item: T = JSON.parse(await Deno.readTextFile(join(directory, entry.name)));
    item.source = item.source.replaceAll("\\", "/");
    if (!selected.includes(item.source)) continue;
    if (result.has(item.source)) throw new Error(`Повторно извлечён документ: ${item.source}`);
    result.set(item.source, item);
  }
  return result;
}
export function child(root: string, name: string): string {
  const path = resolve(root, name), rel = relative(root, path);
  if (!rel || rel === ".." || rel.startsWith("..\\") || rel.startsWith("../") || isAbsolute(rel)) throw new Error(`Путь выходит за пределы курса: ${name}`);
  return path;
}
async function owned(root: string, virtual: string): Promise<string> {
  if (!virtual.startsWith("/") || virtual.startsWith("//")) throw new Error(`Путь относительно корня проекта должен начинаться с /: ${virtual}`);
  const path = child(root, virtual.slice(1));
  const real = await Deno.realPath(path);
  child(root, real);
  return real;
}
function* sourceFiles(value: Json): Generator<string> {
  if (Array.isArray(value)) { for (const item of value) yield* sourceFiles(item); }
  else if (value && typeof value === "object") {
    if (Object.keys(value).length === 1 && typeof value.file === "string") yield value.file;
    else for (const item of Object.values(value)) yield* sourceFiles(item);
  }
}
export async function checkPaths(root: string, model: Course): Promise<void> {
  for (const exercise of model.exercises) {
    if (exercise.project && !(await Deno.stat(await owned(root, exercise.project))).isDirectory) throw new Error(`Отсутствует каталог проекта для ${exercise.id}: ${exercise.project}`);
  }
  for (const item of [...model.exercises, ...model.assessments]) {
    for (const file of sourceFiles(item.extensions)) {
      if (!(await Deno.stat(await owned(root, file))).isFile) throw new Error(`Отсутствует исходный файл: ${file}`);
    }
  }
}
