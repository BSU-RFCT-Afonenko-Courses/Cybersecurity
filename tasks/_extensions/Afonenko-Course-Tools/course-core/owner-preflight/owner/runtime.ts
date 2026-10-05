/** Native process, filesystem and hash helpers; no owner lifecycle dependency. */
import { dirname, isAbsolute, relative, resolve } from "stdlib/path";
import { OwnerFailure } from "./failure.ts";

export const quarto = Deno.env.get("QUARTO") || "quarto";
const decoder = new TextDecoder();
export async function invoke(
  executable: string,
  args: string[],
  cwd: string,
  env: Record<string, string> = {},
) {
  const r = await new Deno.Command(executable, {
    args,
    cwd,
    env,
    stdout: "piped",
    stderr: "piped",
  }).output();
  return {
    exitCode: r.code,
    stdout: decoder.decode(r.stdout),
    stderr: decoder.decode(r.stderr),
  };
}
export function inside(root: string, path: string): string {
  const rel = relative(root, resolve(root, path));
  if (rel === ".." || rel.startsWith("../") || isAbsolute(rel)) {
    throw new OwnerFailure("SOURCE.OUTSIDE_OWNER", path);
  }
  return rel.replaceAll("\\", "/");
}
export async function exists(path: string) {
  try {
    await Deno.stat(path);
    return true;
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return false;
    throw e;
  }
}
export async function inspect(root: string, profile: string) {
  const cwd = (await Deno.stat(root)).isDirectory ? root : dirname(root);
  const r = await invoke(quarto, ["inspect", root, "--profile", profile], cwd);
  if (r.exitCode) throw new OwnerFailure("SOURCE.INSPECT_FAILED", r);
  return JSON.parse(r.stdout);
}
export async function noLink(path: string) {
  if ((await Deno.lstat(path)).isSymlink) {
    throw new OwnerFailure("SOURCE.INVALID_ATTEMPT", "symlink: " + path);
  }
}
export async function digestFile(path: string) {
  await noLink(path);
  return digest(await Deno.readFile(path));
}
export async function digest(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)),
    ),
  ).map((n) => n.toString(16).padStart(2, "0")).join("");
}
export async function objectHash(value: unknown) {
  return digest(new TextEncoder().encode(JSON.stringify(value)));
}
export async function sha(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-1", new TextEncoder().encode(value)),
    ),
  ).map((n) => n.toString(16).padStart(2, "0")).join("");
}
export function insideOrUndefined(root: string, path: string) {
  try {
    return inside(root, path);
  } catch {
    return undefined;
  }
}
