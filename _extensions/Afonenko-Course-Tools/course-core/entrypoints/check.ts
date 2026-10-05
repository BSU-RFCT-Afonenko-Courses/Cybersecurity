import { resolve } from "stdlib/path";
import { check } from "../application/check.ts";
import { runtime } from "../infrastructure/runtime.ts";
export async function main(args: string[] = Deno.args): Promise<void> {
  let project = ".", seenProject = false;
  const adapters: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--adapter" && args[i + 1]) adapters.push(args[++i]);
    else if (args[i] === "--help") { console.log("quarto run check.ts [КАТАЛОГ_ПРОЕКТА] [--adapter КАТАЛОГ_АДАПТЕРА ...]"); return; }
    else if (args[i].startsWith("-") || seenProject) throw new Error(`Неизвестный аргумент: ${args[i]}`);
    else { project = args[i]; seenProject = true; }
  }
  const root = await Deno.realPath(resolve(project));
  const result = await check(runtime(root, adapters));
  console.log(`Курс: заданий — ${result.model.exercises.length}, занятий — ${result.model.assessments.length}\n${result.path}`);
}
if (import.meta.main) await main();
