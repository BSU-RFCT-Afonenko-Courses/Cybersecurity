import type { Catalog, Import } from "./model.ts";
/** Единственная runtime projection оформления импорта; тип Target выводится из неё. */
export function importedTarget(
  item: Catalog["targets"][string],
  spec: Import,
  publication: Catalog["publication"],
) {
  return {
    ...item,
    namespace: spec.namespace,
    baseUrl: spec.baseUrl,
    sourceTitle: spec.title ?? publication?.title ?? spec.namespace,
    ...(spec.style === undefined ? {} : { defaultStyle: spec.style }),
  };
}
