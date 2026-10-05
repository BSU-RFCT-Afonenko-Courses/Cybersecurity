import type { Target } from "./model.ts";
export function assemble(targets: Target[]): Map<string, Target> {
  const result = new Map<string, Target>();
  for (const target of targets) {
    const key = `${target.namespace}:${target.id}`;
    if (result.has(key)) throw new Error(`QRC повторяющаяся цель ${key}: ${result.get(key)!.page}, ${target.page}`);
    result.set(key, target);
  }
  return result;
}
export function resolve(targets: Map<string, Target>, key: string, source: string): Target {
  const target = targets.get(key);
  if (!target) throw new Error(`QRC неизвестная ссылка ${key} in ${source}`);
  return target;
}
