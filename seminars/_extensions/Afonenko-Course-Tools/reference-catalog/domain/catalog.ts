import { diagnostic } from "../diagnostics.ts";
import type { Target } from "./model.ts";
export function assemble(targets: Target[]): Map<string, Target> {
  const result = new Map<string, Target>();
  for (const target of targets) {
    const key = `${target.namespace}:${target.id}`;
    if (result.has(key)) throw diagnostic("QRC.TARGET_DUPLICATE", `повторяющаяся цель ${key}: ${result.get(key)!.page}, ${target.page}`, { id: key, source: `HTML-результат ${target.page}`, related: [{ source: `HTML-результат ${result.get(key)!.page}`, id: key }], hint: "Задайте цели уникальный ID в namespace." });
    result.set(key, target);
  }
  return result;
}
export function resolve(targets: Map<string, Target>, key: string, source: string): Target {
  const target = targets.get(key);
  if (!target) throw diagnostic("QRC.TARGET_UNKNOWN", `неизвестная ссылка ${key}`, { id: key, source: `HTML-результат ${source}`, hint: "Проверьте namespace, ID и текущие страницы или каталог импорта." });
  return target;
}
