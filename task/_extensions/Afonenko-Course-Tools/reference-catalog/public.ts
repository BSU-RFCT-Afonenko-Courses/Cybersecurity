/** Публичная адресация; смысл и содержимое условия принадлежат Core. */
export { createBodyLinks, loadBodyLinks } from "./entrypoints/body-links.ts";
export { bindConditionLinks } from "./entrypoints/condition-links.ts";
export type { ConditionLinkDestination } from "./entrypoints/condition-links.ts";

export { publish as publishReferenceCatalog } from "./infrastructure/publish.ts";
