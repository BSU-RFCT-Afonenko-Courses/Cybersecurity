import type { Exports, Target } from "./model.ts";
import { assemble } from "./catalog.ts";

/** Выбор экспорта определяет публичный каталог, сохраняя все локальные цели для ссылок. */
export function exportedTargets(local: Target[], selection?: Exports): Record<string, Target> {
  const available = assemble(local);
  const chosen = new Map<string, Target>();
  for (const [namespace, ids] of Object.entries(selection ?? {})) {
    if (ids === "*") {
      for (const [key, target] of available) if (target.namespace === namespace) chosen.set(key, target);
    } else {
      for (const id of ids) {
        const key = `${namespace}:${id}`, target = available.get(key);
        if (!target) throw new Error(`QRC экспортируемая цель отсутствует в публикации: ${key}`);
        chosen.set(key, target);
      }
    }
  }
  return Object.fromEntries([...chosen].sort(([a], [b]) => a.localeCompare(b)).map(([key, target]) => {
    // В каталог производителя не входят адреса и настройки оформления потребителя.
    const { baseUrl: _base, sourceTitle: _source, defaultStyle: _style, ...own } = target;
    return [key, own];
  }));
}
