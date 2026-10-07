import { diagnostic } from "../diagnostics.ts";
import type { Exports, Target } from "./model.ts";
import { assemble } from "./catalog.ts";

/** По умолчанию экспортируются все собственные цели; явный выбор ограничивает каталог. */
export function exportedTargets(local: Target[], selection?: Exports): Record<string, Target> {
  const available = assemble(local);
  const chosen = selection === undefined ? new Map(available) : new Map<string, Target>();
  for (const [namespace, ids] of Object.entries(selection ?? {})) {
    if (ids === "*") {
      for (const [key, target] of available) if (target.namespace === namespace) chosen.set(key, target);
    } else {
      for (const id of ids) {
        const key = `${namespace}:${id}`, target = available.get(key);
        if (!target) throw diagnostic("QRC.TARGET_UNKNOWN", `экспортируемая цель отсутствует в публикации: ${key}`, { id: key, field: `reference-catalog.exports.${namespace}`, hint: "Включите исходный документ цели в текущую сборку или исправьте выбор экспорта." });
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
