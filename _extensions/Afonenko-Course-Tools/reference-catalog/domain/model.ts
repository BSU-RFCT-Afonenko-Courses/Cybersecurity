import { referenceStyles } from "./contract.ts";
export type ReferenceStyle = typeof referenceStyles[number];
import type { validateImportedCatalog } from "../infrastructure/catalog-validation.ts";
import type { parseImports } from "../infrastructure/import-config.ts";
import type { parseExports } from "../infrastructure/export-config.ts";
import type { importedTarget } from "./import-target.ts";
export type Catalog = ReturnType<typeof validateImportedCatalog>;
export type Import = ReturnType<typeof parseImports>[number];
/** Publication fields и consumer decoration выводятся из фактических owners. */
export type Target =
  & Catalog["targets"][string]
  & Partial<ReturnType<typeof importedTarget>>;
export interface Reference {
  key: string;
  style: ReferenceStyle;
  custom: boolean;
}
/** Отсутствие exports и пустой exports имеют разные runtime значения. */
export type Exports = NonNullable<ReturnType<typeof parseExports>>;
