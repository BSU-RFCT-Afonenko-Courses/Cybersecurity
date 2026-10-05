import {
  dirname,
  fromFileUrl,
  isAbsolute,
  join,
  relative,
  resolve,
} from "stdlib/path";
export { dirname, fromFileUrl, isAbsolute, join, relative, resolve };
export async function exists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return false;
    throw e;
  }
}
export async function files(root: string): Promise<string[]> {
  const out: string[] = [];
  for await (const item of Deno.readDir(root)) {
    if (item.isSymlink) {
      throw new Error(
        `Публикация символические ссылки в результатах сборки не поддерживаются: ${
          join(root, item.name)
        }`,
      );
    }
    const path = join(root, item.name);
    if (item.isDirectory) out.push(...await files(path));
    else if (item.isFile) out.push(path);
  }
  return out.sort();
}
export function within(root: string, path: string): string {
  const result = resolve(root, path), rel = relative(root, result);
  if (
    !rel || rel === ".." || rel.startsWith("../") || rel.startsWith("..\\") ||
    isAbsolute(rel)
  ) throw new Error(`Публикация ожидается путь к вложенному каталогу: ${path}`);
  return result;
}
export async function copyTree(from: string, to: string): Promise<void> {
  for (const path of await files(from)) {
    const dest = join(to, relative(from, path));
    await Deno.mkdir(dirname(dest), { recursive: true });
    await Deno.copyFile(path, dest);
  }
}
/** Копируем исходники, сохраняя относительные включения и общие ресурсы. */
export async function copySources(
  from: string,
  to: string,
  excluded: Set<string>,
): Promise<void> {
  await Deno.mkdir(to, { recursive: true });
  for await (const item of Deno.readDir(from)) {
    if (
      excluded.has(item.name) || item.name.endsWith("_files") ||
      item.name === "__pycache__"
    ) continue;
    const source = join(from, item.name), destination = join(to, item.name);
    if (item.isSymlink) {
      throw new Error(
        `Публикация символические ссылки в исходниках не поддерживаются: ${source}`,
      );
    }
    if (item.isDirectory) await copySources(source, destination, excluded);
    else if (item.isFile) await Deno.copyFile(source, destination);
  }
}

/** Лексическое владение не даёт права следовать symlink или mount в другой FS. */
export async function safeDirectory(root: string, path: string): Promise<void> {
  const rel = relative(root, path);
  if (rel === ".." || rel.startsWith("../") || isAbsolute(rel)) {
    throw new Error("Публикация каталог вне корня");
  }
  const device = (await Deno.stat(root)).dev;
  let current = root;
  for (const part of rel.split(/[\\/]/).filter(Boolean)) {
    current = join(current, part);
    let info;
    try {
      info = await Deno.lstat(current);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) break;
      throw error;
    }
    if (info.isSymlink) {
      throw new Error(
        `Публикация символические ссылки в storage/output запрещены: ${current}`,
      );
    }
    if (!info.isDirectory) {
      throw new Error(`Публикация ожидается каталог: ${current}`);
    }
    if (info.dev !== device) {
      throw new Error(
        `Публикация storage/output должны находиться в одной файловой системе: ${current}`,
      );
    }
  }
}
