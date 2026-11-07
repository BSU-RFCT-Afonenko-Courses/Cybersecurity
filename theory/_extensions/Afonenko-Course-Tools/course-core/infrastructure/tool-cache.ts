import { isAbsolute, relative, resolve } from "stdlib/path";
/** Зарезервирован только служебный namespace; обычный учебный .cache остаётся input. */
export function stableToolCachePath(path: string): boolean {
  const parts = path.replaceAll("\\", "/").split("/");
  return parts.some((part, index) =>
    part === ".cache" && parts[index + 1] === "codex-tools"
  );
}
/** Только cache внутри данного owner; owner сам может находиться в рабочем tool cache. */
export function toolCachePath(
  owner: string,
  path: string,
  configured = Deno.env.get("XDG_CACHE_HOME"),
): boolean {
  const candidate = resolve(owner, path), name = relative(owner, candidate);
  if (isAbsolute(name) || name === ".." || name.startsWith("../")) return false;
  if (stableToolCachePath(name)) return true;
  if (!configured || !isAbsolute(configured)) return false;
  const cache = resolve(configured), local = relative(owner, cache);
  if (
    !local || isAbsolute(local) || local === ".." || local.startsWith("../")
  ) return false;
  return candidate === cache || candidate.startsWith(cache + "/");
}
/** Новый контейнер cache допустим лишь без новых предметных соседей. Сам cache не обходится. */
export async function toolCacheContainer(
  owner: string,
  path: string,
  configured = Deno.env.get("XDG_CACHE_HOME"),
): Promise<boolean> {
  if (toolCachePath(owner, path, configured)) return true;
  const candidate = resolve(owner, path), name = relative(owner, candidate);
  if (isAbsolute(name) || name === ".." || name.startsWith("../")) return false;
  const configuredChild = configured && isAbsolute(configured) &&
    toolCachePath(owner, configured, configured) &&
    resolve(configured).startsWith(candidate + "/");
  if (candidate.split("/").at(-1) !== ".cache" && !configuredChild) {
    return false;
  }
  const info = await Deno.lstat(candidate);
  if (!info.isDirectory || info.isSymlink) return false;
  for await (const entry of Deno.readDir(candidate)) {
    if (
      !await toolCacheContainer(
        owner,
        resolve(candidate, entry.name),
        configured,
      )
    ) return false;
  }
  return true;
}
