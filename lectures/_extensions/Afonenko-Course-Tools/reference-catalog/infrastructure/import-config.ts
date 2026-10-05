import type { Import, ReferenceStyle } from "../domain/model.ts";
import { normalizeCatalogSource } from "./catalog-source.ts";

import { referenceStyles, namespacePattern, importKeys } from "../domain/contract.ts";
export { referenceStyles };
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function publicationBaseUrl(value: unknown, context: string): string {
  if (typeof value !== "string") throw new Error(`QRC ${context} должен быть HTTP(S) URL с завершающим /`);
  let url: URL;
  try { url = new URL(value); }
  catch { throw new Error(`QRC ${context} должен быть HTTP(S) URL с завершающим /`); }
  if (!["http:", "https:"].includes(url.protocol) || url.search || url.hash || url.username || url.password || !url.pathname.endsWith("/")) {
    throw new Error(`QRC ${context} должен быть HTTP(S) URL с завершающим / без параметров запроса, фрагмента и учётных данных`);
  }
  return url.href;
}

/** Проверка публичной конфигурации не зависит от inspect и render Quarto. */
export function parseImports(raw: unknown, root: string, memberNamespaces: string[]): Import[] {
  if (raw === undefined) return [];
  if (!isRecord(raw)) throw new Error("QRC imports должен сопоставлять пространствам имён настройки импорта");
  const result: Import[] = [];
  for (const [namespace, item] of Object.entries(raw)) {
    if (!namespacePattern.test(namespace) || memberNamespaces.includes(namespace)) throw new Error(`QRC некорректное пространство имён импорта ${namespace}`);
    if (!isRecord(item)) throw new Error(`QRC настройки импорта ${namespace} должны быть отображением`);
    for (const key of Object.keys(item)) {
      if (!(importKeys as readonly string[]).includes(key)) throw new Error(`QRC неизвестное свойство импорта ${namespace}.${key}`);
    }
    const source = item.source;
    if (typeof source !== "string" || !source.trim()) throw new Error(`QRC import ${namespace} требуется source`);
    if (typeof item.namespace !== "string" || !namespacePattern.test(item.namespace)) throw new Error(`QRC import ${namespace} требуется корректное пространство имён источника`);
    if (item.title !== undefined && (typeof item.title !== "string" || !item.title.trim())) throw new Error(`QRC import ${namespace}.title должен быть непустой строкой`);
    if (item.style !== undefined && !referenceStyles.includes(item.style as ReferenceStyle)) throw new Error(`QRC некорректный стиль импорта ${namespace}.style`);
    result.push({
      namespace,
      source: normalizeCatalogSource(source, root),
      sourceNamespace: item.namespace,
      baseUrl: publicationBaseUrl(item["base-url"], `import ${namespace} base-url`),
      ...(item.title === undefined ? {} : { title: item.title as string }),
      ...(item.style === undefined ? {} : { style: item.style as ReferenceStyle }),
    });
  }
  return result;
}
