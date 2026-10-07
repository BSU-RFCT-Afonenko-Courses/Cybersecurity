import { diagnostic } from "../diagnostics.ts";
import type { Catalog, Import, Target } from "../domain/model.ts";
import { readCatalogSource } from "./catalog-source.ts";
import { validateImportedCatalog } from "./catalog-validation.ts";

async function readCatalog(source: string): Promise<Catalog> {
  const text = await readCatalogSource(source);
  let data: unknown;
  try { data = JSON.parse(text); }
  catch (cause) { throw diagnostic("QRC.IMPORT_INVALID", "некорректный JSON импортированного каталога", { source, field: "JSON", hint: "Проверьте выбранный каталог публикации; позиции JSON не являются строками QMD." }, cause); }
  return validateImportedCatalog(data, source);
}

/** Каждый источник читается один раз, в том числе при импорте нескольких пространств имён. */
export async function importTargets(imports: Import[], options: { allowMissingLocal?: boolean } = {}): Promise<Target[]> {
  const snapshots = new Map<string, Promise<Catalog | undefined>>();
  const result: Target[] = [];
  for (const spec of imports) {
    const local = !/^https?:\/\//.test(spec.source);
    if (!snapshots.has(spec.source)) snapshots.set(spec.source, readCatalog(spec.source).catch(error => {
      if (options.allowMissingLocal && local && error instanceof Error && error.cause instanceof Deno.errors.NotFound) return undefined;
      throw error;
    }));
    const catalog = await snapshots.get(spec.source)!;
    if (!catalog) continue;
    let count = 0;
    for (const item of Object.values(catalog.targets)) {
      if (item.namespace !== spec.sourceNamespace) continue;
      result.push({
        ...item,
        namespace: spec.namespace,
        baseUrl: spec.baseUrl,
        sourceTitle: spec.title ?? catalog.publication?.title ?? spec.namespace,
        ...(spec.style === undefined ? {} : { defaultStyle: spec.style }),
      });
      count++;
    }
    if (!count && !(options.allowMissingLocal && local)) throw diagnostic("QRC.IMPORT_INVALID", `импорт не содержит пространство имён ${spec.sourceNamespace}: ${spec.source}`, { source: spec.source, id: spec.namespace, field: "namespace", related: [{ id: spec.sourceNamespace }], hint: "Проверьте namespace производителя и текущий экспорт." });
  }
  return result;
}
