import { diagnostic } from "../diagnostics.ts";
function selection(ids: unknown, invalid: () => never) {
  if (ids === "*") return ids;
  const id = (value: unknown): value is string =>
    typeof value === "string" && !!value && !/[\s:#]/.test(value);
  if (
    !Array.isArray(ids) || !ids.every(id) || new Set(ids).size !== ids.length
  ) invalid();
  return ids;
}

export function parseExports(raw: unknown, namespaces: string[]) {
  if (raw === undefined) return undefined;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw diagnostic(
      "QRC.CONFIG_INVALID",
      "exports должен сопоставлять локальным пространствам имён '*' или списки ID",
      { field: "reference-catalog.exports" },
    );
  }
  const result: Record<string, ReturnType<typeof selection>> = {};
  for (const [namespace, ids] of Object.entries(raw)) {
    if (!namespaces.includes(namespace)) {
      throw diagnostic(
        "QRC.CONFIG_INVALID",
        `пространство имён экспорта не относится к локальному проекту: ${namespace}`,
        { id: namespace, field: `reference-catalog.exports.${namespace}` },
      );
    }
    result[namespace] = selection(ids, () => {
      throw diagnostic(
        "QRC.CONFIG_INVALID",
        `exports.${namespace} должен содержать '*' или список неповторяющихся ID целей`,
        { id: namespace, field: `reference-catalog.exports.${namespace}` },
      );
    });
  }
  return result;
}

export function parsePublication(raw: unknown): { title: string } | undefined {
  if (raw === undefined) return undefined;
  if (
    !raw || typeof raw !== "object" || Array.isArray(raw) ||
    Object.keys(raw).some((key) => key !== "title") ||
    typeof (raw as { title?: unknown }).title !== "string" ||
    !(raw as { title: string }).title.trim()
  ) {
    throw diagnostic(
      "QRC.CONFIG_INVALID",
      "publication должен содержать непустое название title",
      { field: "reference-catalog.publication.title" },
    );
  }
  return { title: (raw as { title: string }).title.trim() };
}
