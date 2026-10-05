import { join, resolve } from "stdlib/path";
import type { Adapter, Contract } from "../domain/model.ts";
import { child, exists } from "./files.ts";
async function packages(directory: string): Promise<string[]> {
  if (!await exists(directory)) return [];
  const result: string[] = [];
  for await (const entry of Deno.readDir(directory)) {
    if (!entry.isDirectory) continue;
    const path = join(directory, entry.name);
    if (await exists(join(path, "contract.json"))) result.push(path);
    else if (!await exists(join(path, "_extension.yml"))) {
      for await (const nested of Deno.readDir(path)) {
        if (nested.isDirectory && await exists(join(path, nested.name, "contract.json"))) result.push(join(path, nested.name));
      }
    }
  }
  return result.sort();
}
export async function adapters(root: string, explicit: string[]): Promise<Adapter[]> {
  const paths: string[] = [];
  const installed = await packages(join(root, "_extensions"));
  for (const argument of explicit) {
    if (/^[a-z][a-z0-9-]*$/.test(argument)) {
      const matches: string[] = [];
      for (const path of installed) {
        let candidate: {name?: string};
        try { candidate = JSON.parse(await Deno.readTextFile(join(path, "contract.json"))); }
        catch { continue; } // Неактивный повреждённый пакет не участвует в контракте.
        if (candidate.name === argument) matches.push(path);
      }
      if (matches.length !== 1) throw new Error(`Для адаптера ${argument} требуется ровно один установленный пакет; найдено: ${matches.length}`);
      paths.push(matches[0]); continue;
    }
    const path = resolve(root, argument);
    if (await exists(join(path, "contract.json"))) paths.push(path);
    else paths.push(...await packages(join(path, "_extensions")));
  }
  const result: Adapter[] = [];
  for (const path of paths) {
    const contract: Contract = JSON.parse(await Deno.readTextFile(join(path, "contract.json")));
    if (contract.name === "course-core" || contract.name === "reference-catalog") continue;
    if (!/^[a-z][a-z0-9-]*$/.test(contract.name) || contract.name === "manual") throw new Error(`Недопустимое имя адаптера: ${contract.name}`);
    for (const field of ["version", "requires_core", "api", "ir", "supported_ir"]) {
      if (field in contract) throw new Error(`Адаптер ${contract.name}: поле ${field} не поддерживается; обновите пакет до текущего контракта`);
    }
    if (typeof contract.rules !== "string" || !contract.rules) throw new Error(`Адаптер ${contract.name}: требуется путь rules к схеме CUE`);
    child(path, contract.rules);
    if (result.some(a => a.contract.name === contract.name)) throw new Error(`Повторный адаптер: ${contract.name}`);
    result.push({ directory: path, contract, fragments: new Map() });
  }
  if (explicit.length && !result.length) throw new Error("По указанным путям не найдены контракты адаптеров");
  return result;
}
