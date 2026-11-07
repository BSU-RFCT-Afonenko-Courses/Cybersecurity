import { dirname, isAbsolute, relative } from "stdlib/path";
import { diagnostic } from "../domain/diagnostics.ts";
const fail = (text: string): never => {
  throw diagnostic("ARTIFACT.MATERIALIZATION_INVALID", text);
};
export const inside = (parent: string, path: string) => {
  const r = relative(parent, path);
  return !r ||
    !isAbsolute(r) && r !== ".." && !r.startsWith("../") &&
      !r.startsWith("..\\");
};
export const overlaps = (a: string, b: string) => inside(a, b) || inside(b, a);
export async function hash(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new Uint8Array(bytes).buffer,
  );
  return Array.from(
    new Uint8Array(digest),
    (x) => x.toString(16).padStart(2, "0"),
  ).join("");
}
export async function absent(path: string) {
  try {
    await Deno.lstat(path);
    return false;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return true;
    throw error;
  }
}
export async function real(path: string) {
  if (await Deno.realPath(path) !== path) {
    fail("Символическая ссылка в пути: " + path);
  }
  return path;
}
export async function safeParent(path: string) {
  let parent = path;
  while (await absent(parent)) {
    const next = dirname(parent);
    if (next === parent) fail("Не найден родитель выходного пути");
    parent = next;
  }
  await real(parent);
  if (!(await Deno.lstat(parent)).isDirectory) {
    fail("Родитель выходного пути не является каталогом");
  }
}
export function local(path: string) {
  if (
    typeof path !== "string" || !path || /[\\\0*?\[\]{}:]/.test(path) ||
    isAbsolute(path) ||
    path.split("/").some((p) => !p || p === "." || p === "..")
  ) fail("Недопустимый относительный путь: " + path);
  return path;
}
