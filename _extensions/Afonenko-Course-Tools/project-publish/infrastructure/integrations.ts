import type { Integration, Workspace } from "../domain/model.ts";
import { toFileUrl } from "stdlib/path";
import { relative, within } from "./files.ts";
export async function integrations(
  w: Workspace,
  sourceRoot: string,
  paths = w.integrations,
): Promise<Integration[]> {
  const result: Integration[] = [];
  for (const path of paths) {
    if (!w.integrations.includes(path)) {
      throw new Error(
        "Публикация: callback отсутствует в configured integrations",
      );
    }
    const module = await import(
      toFileUrl(within(sourceRoot, relative(w.root, path))).href
    );
    if (
      !module.default ||
      (typeof module.default.beforeRender !== "function" &&
        typeof module.default.metadata !== "function" &&
        typeof module.default.finalize !== "function" &&
        typeof module.default.onFailure !== "function") ||
      (module.default.onFailure !== undefined &&
        typeof module.default.onFailure !== "function")
    ) throw new Error(`Публикация: модуль ${path} не предоставляет интеграцию`);
    result.push(module.default);
  }
  return result;
}
