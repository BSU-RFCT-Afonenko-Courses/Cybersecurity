import { diagnostic } from "../diagnostics.ts";
import type { Exports } from "../domain/model.ts";

export function parseExports(raw: unknown, namespaces: string[]): Exports | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw diagnostic("QRC.CONFIG_INVALID", "exports должен сопоставлять локальным пространствам имён '*' или списки ID", { field: "reference-catalog.exports" });
  const result: Exports = {};
  for (const [namespace, ids] of Object.entries(raw)) {
    if (!namespaces.includes(namespace)) throw diagnostic("QRC.CONFIG_INVALID", `пространство имён экспорта не относится к локальному проекту: ${namespace}`, { id: namespace, field: `reference-catalog.exports.${namespace}` });
    if (ids !== "*" && (!Array.isArray(ids) || ids.some(id => typeof id !== "string" || !id || /[\s:#]/.test(id)) || new Set(ids).size !== ids.length)) {
      throw diagnostic("QRC.CONFIG_INVALID", `exports.${namespace} должен содержать '*' или список неповторяющихся ID целей`, { id: namespace, field: `reference-catalog.exports.${namespace}` });
    }
    result[namespace] = ids as "*" | string[];
  }
  return result;
}

export function parsePublication(raw: unknown): { title: string } | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw) ||
    Object.keys(raw).some(key => key !== "title") ||
    typeof (raw as { title?: unknown }).title !== "string" || !(raw as { title: string }).title.trim()) {
    throw diagnostic("QRC.CONFIG_INVALID", "publication должен содержать непустое название title", { field: "reference-catalog.publication.title" });
  }
  return { title: (raw as { title: string }).title.trim() };
}
