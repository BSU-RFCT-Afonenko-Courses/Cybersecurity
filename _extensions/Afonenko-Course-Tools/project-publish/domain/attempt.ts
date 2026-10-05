import type { BuildState, Workspace } from "./model.ts";

function canonical(value: unknown): string {
  const order = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(order);
    if (item !== null && typeof item === "object") {
      return Object.fromEntries(
        Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(
          ([key, value]) => [key, order(value)],
        ),
      );
    }
    return item;
  };
  return JSON.stringify(order(value));
}

export function unchanged(w: Workspace, state: BuildState): void {
  if (canonical(w) !== canonical(state.workspace)) {
    throw new Error(
      "Публикация: профиль, конфигурация или каталог вывода изменились после подготовки попытки; выполните новый render",
    );
  }
}
