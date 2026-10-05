import type { Catalog, Import, Target } from "../domain/model.ts";
import { readCatalogSource } from "./catalog-source.ts";
import { validateImportedCatalog } from "./catalog-validation.ts";

async function readCatalog(source: string): Promise<Catalog> {
  const text = await readCatalogSource(source);
  let data: unknown;
  try { data = JSON.parse(text); }
  catch { throw new Error(`QRC некорректный JSON импортированного каталога in ${source}`); }
  return validateImportedCatalog(data, source);
}

/** Каждый источник читается один раз, в том числе при импорте нескольких пространств имён. */
export async function importTargets(imports: Import[]): Promise<Target[]> {
  const snapshots = new Map<string, Promise<Catalog>>();
  const result: Target[] = [];
  for (const spec of imports) {
    if (!snapshots.has(spec.source)) snapshots.set(spec.source, readCatalog(spec.source));
    const catalog = await snapshots.get(spec.source)!;
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
    if (!count) throw new Error(`QRC импорт не содержит пространство имён ${spec.sourceNamespace}: ${spec.source}`);
  }
  return result;
}
