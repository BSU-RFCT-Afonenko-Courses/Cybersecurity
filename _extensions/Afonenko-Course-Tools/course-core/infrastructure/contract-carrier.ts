import { dirname, join } from "stdlib/path";
import { fail } from "../contracts/project.ts";
import { hash, signature } from "../runtime/source-snapshot.ts";
/** Только локальный carrier Core; не Source snapshot и не provider authority. */
export async function contractCarrierWitness(root: string) {
  const reject = () =>
    fail("CONTEXT_OWNER", "Изменён physical native contract carrier");
  const canonical = async (path: string) => {
    const info = await Deno.lstat(path);
    if (info.isSymlink || await Deno.realPath(path) !== path) reject();
    return info;
  };
  const parents: { path: string; identity: string }[] = [];
  for (let path = root;; path = dirname(path)) {
    const info = await canonical(path);
    if (!info.isDirectory) reject();
    parents.push({
      path,
      identity: JSON.stringify([info.dev, info.ino, info.mode]),
    });
    if (dirname(path) === path) break;
  }
  const path = join(root, "_quarto.yml"), info = await canonical(path);
  if (!info.isFile || info.nlink !== 1 || info.size > 1024 * 1024) reject();
  const stamp = signature(info), digest = await hash(await Deno.readFile(path));
  if (signature(await canonical(path)) !== stamp) reject();
  const check = async (scratch: boolean) => {
    for (const parent of parents) {
      const now = await canonical(parent.path);
      if (
        !now.isDirectory ||
        JSON.stringify([now.dev, now.ino, now.mode]) !== parent.identity
      ) reject();
    }
    for await (const entry of Deno.readDir(root)) {
      if (entry.name === "_quarto.yml") continue;
      if (
        !scratch || entry.name !== ".quarto" ||
        !(await canonical(join(root, entry.name))).isDirectory
      ) reject();
    }
    const now = await canonical(path);
    if (
      !now.isFile || now.nlink !== 1 || signature(now) !== stamp ||
      await hash(await Deno.readFile(path)) !== digest ||
      signature(await canonical(path)) !== stamp
    ) reject();
  };
  await check(false);
  return { beforeChild: () => check(false), afterChild: () => check(true) };
}
