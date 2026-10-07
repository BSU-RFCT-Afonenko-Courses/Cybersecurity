import { diagnostic, type DiagnosticContext } from "../diagnostics.ts";
import type { Import, ReferenceStyle } from "../domain/model.ts";
import { normalizeCatalogSource } from "./catalog-source.ts";

import { referenceStyles, namespacePattern, importKeys } from "../domain/contract.ts";
export { referenceStyles };
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function publicationBaseUrl(value: unknown, context: string, location: DiagnosticContext = {}): string {
  if (typeof value !== "string") throw diagnostic("QRC.IMPORT_INVALID", `${context} должен быть HTTP(S) URL с завершающим /`, { ...location, field: location.field ?? context });
  let url: URL;
  try { url = new URL(value); }
  catch (cause) { throw diagnostic("QRC.IMPORT_INVALID", `${context} должен быть HTTP(S) URL с завершающим /`, { ...location, field: location.field ?? context }, cause); }
  if (!["http:", "https:"].includes(url.protocol) || url.search || url.hash || url.username || url.password || !url.pathname.endsWith("/")) {
    throw diagnostic("QRC.IMPORT_INVALID", `${context} должен быть HTTP(S) URL с завершающим / без параметров запроса, фрагмента и учётных данных`, { ...location, field: location.field ?? context });
  }
  return url.href;
}

/** Проверка публичной конфигурации не зависит от inspect и render Quarto. */
export function parseImports(raw: unknown, root: string, memberNamespaces: string[]): Import[] {
  if (raw === undefined) return [];
  if (!isRecord(raw)) throw diagnostic("QRC.IMPORT_INVALID", "imports должен сопоставлять пространствам имён настройки импорта", { source: root, field: "reference-catalog.imports" });
  const result: Import[] = [];
  for (const [namespace, item] of Object.entries(raw)) {
    const invalid = (message: string, field: string) => diagnostic("QRC.IMPORT_INVALID", message, { source: isRecord(item) && typeof item.source === "string" ? item.source : root, id: namespace, field: `reference-catalog.imports.${namespace}.${field}` });
    if (!namespacePattern.test(namespace) || memberNamespaces.includes(namespace)) throw invalid(`некорректное пространство имён импорта ${namespace}`, `namespace`);
    if (!isRecord(item)) throw invalid(`настройки импорта ${namespace} должны быть отображением`, `imports`);
    for (const key of Object.keys(item)) {
      if (!(importKeys as readonly string[]).includes(key)) throw invalid(`неизвестное свойство импорта ${namespace}.${key}`, `${key}`);
    }
    const source = item.source;
    if (typeof source !== "string" || !source.trim()) throw invalid(`импорт ${namespace} требуется source`, `source`);
    if (typeof item.namespace !== "string" || !namespacePattern.test(item.namespace)) throw invalid(`импорт ${namespace} требуется корректное пространство имён источника`, `namespace`);
    if (item.title !== undefined && (typeof item.title !== "string" || !item.title.trim())) throw invalid(`импорт ${namespace}.title должен быть непустой строкой`, `title`);
    if (item.style !== undefined && !referenceStyles.includes(item.style as ReferenceStyle)) throw invalid(`некорректный стиль импорта ${namespace}.style`, `style`);
    result.push({
      namespace,
      source: normalizeCatalogSource(source, root, namespace),
      sourceNamespace: item.namespace,
      baseUrl: publicationBaseUrl(item["base-url"], `импорт ${namespace} base-url`, { source, id: namespace, field: `reference-catalog.imports.${namespace}.base-url` }),
      ...(item.title === undefined ? {} : { title: item.title as string }),
      ...(item.style === undefined ? {} : { style: item.style as ReferenceStyle }),
    });
  }
  return result;
}
