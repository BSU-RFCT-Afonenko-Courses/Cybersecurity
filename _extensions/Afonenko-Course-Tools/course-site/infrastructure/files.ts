import {
  dirname,
  fromFileUrl,
  isAbsolute,
  join,
  relative,
  resolve,
  toFileUrl,
} from "stdlib/path";
export { dirname, fromFileUrl, isAbsolute, join, relative, resolve, toFileUrl };
export function inside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return !isAbsolute(rel) && rel !== ".." && !rel.startsWith("../") &&
    !rel.startsWith("..\\");
}
export function within(root: string, path: string): string {
  const full = resolve(root, path);
  if (full === resolve(root) || !inside(root, full)) {
    throw new Error(`course-site requires a contained descendant: ${path}`);
  }
  return full;
}
export async function safePath(root: string, path: string): Promise<void> {
  if (!inside(root, path)) {
    throw new Error(`course-site path escapes root: ${path}`);
  }
  let current = root;
  for (
    const part of ["", ...relative(root, path).split(/[\\/]/).filter(Boolean)]
  ) {
    current = join(current, part);
    try {
      if ((await Deno.lstat(current)).isSymlink) {
        throw new Error(`course-site symlink forbidden: ${current}`);
      }
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) return;
      throw e;
    }
  }
}
export async function files(root: string): Promise<string[]> {
  const result: string[] = [];
  for await (const entry of Deno.readDir(root)) {
    const path = join(root, entry.name);
    if (entry.isSymlink) {
      throw new Error(`course-site symlink forbidden: ${path}`);
    }
    if (entry.isDirectory) result.push(...await files(path));
    else if (entry.isFile) result.push(path);
  }
  return result.sort();
}
export async function outputDirectory(
  root: string,
  name: string,
): Promise<string> {
  const output = within(root, name);
  if (
    relative(root, output).split(/[\\/]/).some((p) =>
      [".quarto", "_freeze", "_extensions", "_generated", ".git"].includes(p)
    )
  ) throw new Error(`course-site output overlaps native/source state: ${name}`);
  await safePath(root, output);
  return output;
}
export async function cleanOutput(root: string, output: string): Promise<void> {
  await outputDirectory(root, output);
  try {
    for (const file of await files(output)) {
      if (
        (/\.(qmd|md|ipynb|Rmd|ya?ml)$/i.test(file) &&
          !/(?:^|\/)(?:site_)?libs\/revealjs\/plugin\/[A-Za-z0-9._-]+\/plugin\.yml$/.test(
            relative(output, file).replaceAll("\\", "/"),
          )) ||
        file.split(/[\\/]/).some((p) =>
          [".git", ".quarto", "_freeze", "_extensions"].includes(p)
        )
      ) {
        throw new Error(
          `course-site refuses to delete source/cache files: ${file}`,
        );
      }
    }
    await Deno.remove(output, { recursive: true });
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }
  await Deno.mkdir(output, { recursive: true });
}
export async function copyFiles(
  source: string,
  destination: string,
  paths: string[],
): Promise<void> {
  for (const path of paths) {
    within(source, path);
    await safePath(source, path);
    if (!(await Deno.lstat(path)).isFile) {
      throw new Error(`course-site missing current file: ${path}`);
    }
    const target = within(destination, relative(source, path));
    await safePath(destination, target);
    await Deno.mkdir(dirname(target), { recursive: true });
    await Deno.copyFile(path, target);
  }
}
