/** Публичные имена и конечные множества конфигурации QRC. */
export { referenceStyles } from "./generated/reference-styles.ts";
export const configKeys = ["namespace", "imports", "exports", "publication"] as const;
export const importKeys = ["source", "namespace", "base-url", "title", "style"] as const;
export const targetKeys = ["namespace", "id", "page", "fragment", "labelHtml", "numberHtml", "label", "number", "slide", "title"] as const;
export const catalogKeys = ["schema", "generator", "publication", "targets"] as const;
export const namespacePattern = /^[A-Za-z][A-Za-z0-9_-]*$/;
