import { join, resolve, relative, isAbsolute, dirname, fromFileUrl } from "stdlib/path";
export { join, resolve, relative, isAbsolute, dirname, fromFileUrl };
export async function exists(path: string): Promise<boolean> {
  try { await Deno.stat(path); return true; } catch (e) { if (e instanceof Deno.errors.NotFound) return false; throw e; }
}
export async function files(root: string): Promise<string[]> {
  const out: string[] = [];
  for await (const item of Deno.readDir(root)) {
    if (item.isSymlink) throw new Error(`QRC символические ссылки в результатах сборки не поддерживаются: ${join(root, item.name)}`);
    const path = join(root, item.name);
    if (item.isDirectory) out.push(...await files(path)); else if (item.isFile) out.push(path);
  }
  return out.sort();
}
