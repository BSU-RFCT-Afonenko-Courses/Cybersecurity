import {assemble, resolve} from "../domain/catalog.ts";
import {href} from "../domain/urls.ts";
import {namespacePattern, referenceStyles} from "../domain/contract.ts";
import type {Target} from "../domain/model.ts";
import {validateImportedCatalog} from "../infrastructure/catalog-validation.ts";
import {parseImports, publicationBaseUrl} from "../infrastructure/import-config.ts";
import {importTargets} from "../infrastructure/imports.ts";
import {readCatalogSource} from "../infrastructure/catalog-source.ts";
import {diagnostic} from "../diagnostics.ts";

/** Публичная адресация выбранного Body; содержимое задач остаётся у Core. */
export function createBodyLinks(options: {catalog: unknown; baseUrl: string; importedTargets?: Target[]}) {
  const baseUrl = publicationBaseUrl(options.baseUrl, "Body publication base-url");
  const catalog = validateImportedCatalog(options.catalog, "Body publication catalog");
  const targets = assemble([
    ...Object.values(catalog.targets),
    ...options.importedTargets ?? [],
  ]);
  return {
    resolve(key: string, requestedStyle: string, source: string): {href: string; label: string} {
      if (!(referenceStyles as readonly string[]).includes(requestedStyle)) {
        throw diagnostic("QRC.REFERENCE_INVALID", "Неверный стиль ссылки Body", {source, id: key, field: "style"});
      }
      const target = resolve(targets, key, source);
      const style = requestedStyle === "default" ? target.defaultStyle ?? "default" : requestedStyle;
      if (style === "external" && !target.baseUrl) throw diagnostic("QRC.REFERENCE_INVALID", "Стиль external требует импортированной цели", {source, id: key, field: "style"});
      const label = style === "number" ? target.number : style === "title" || style === "external" ? target.title ?? target.label : target.label;
      if (!label) throw diagnostic("QRC.REFERENCE_INVALID", "Цель не имеет запрошенной подписи", {source, id: key, field: "style"});
      return {href: target.baseUrl ? href("index.html", target) : new URL(href("index.html", target), baseUrl).href, label};
    },
  };
}

/** Загружается только при ссылке в выбранном публичном фрагменте. */
export async function loadBodyLinks(options: {
  catalogFile: string; baseUrl: string; root: string; namespace: string; imports?: unknown;
}) {
  if (!namespacePattern.test(options.namespace)) throw diagnostic("QRC.CONFIG_INVALID", "Body требует namespace проекта", {source: options.root, field: "namespace"});
  const catalog = JSON.parse(await readCatalogSource(options.catalogFile));
  const imports = parseImports(options.imports, options.root, [options.namespace]);
  return createBodyLinks({catalog, baseUrl: options.baseUrl, importedTargets: await importTargets(imports)});
}
