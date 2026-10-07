import { diagnostic } from "../diagnostics.ts";
import { targetKeys, catalogKeys } from "../domain/contract.ts";
import type { Catalog, Target } from "../domain/model.ts";
import { isRecord } from "./import-config.ts";

function nonempty(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function keys(item: Record<string, unknown>, allowed: readonly string[], context: string, source: string, id?: string): void {
  for (const key of Object.keys(item)) if (!allowed.includes(key)) throw diagnostic("QRC.IMPORT_INVALID", `${context}: недопустимое поле ${key}`, { source, id, field: key });
}
function target(value: unknown, key: string, source: string): Target {
  const invalid = (field: string): never => { throw diagnostic("QRC.IMPORT_INVALID", `некорректная импортированная цель ${key}: ${field}`, { source, id: key, field }); };
  if (!isRecord(value)) invalid("ожидается объект");
  const item = value as Record<string, unknown>;
  for (const field of ["baseUrl", "sourceTitle", "defaultStyle"]) {
    if (Object.hasOwn(item, field)) invalid(`${field} недопустимо в каталоге публикации`);
  }
  keys(item, targetKeys, `цель ${key}`, source, key);
  for (const field of ["namespace", "id", "page", "fragment", "labelHtml", "label"] as const) if (!nonempty(item[field])) invalid(field);
  for (const field of ["numberHtml", "number"] as const) if (typeof item[field] !== "string") invalid(field);
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(item.namespace as string)) invalid("namespace");
  if (key !== `${item.namespace}:${item.id}`) invalid("ключ каталога должен совпадать с namespace:id");
  const page = item.page as string;
  if (/[\\?#:\u0000-\u001f]/.test(page) || page.split("/").some((part) => !part || part === "." || part === "..")) invalid("page должен быть относительным путём публикации");
  for (const field of ["slide", "title"] as const) if (item[field] !== undefined && !nonempty(item[field])) invalid(field);
  return {
    namespace: item.namespace as string, id: item.id as string,
    page, fragment: item.fragment as string,
    labelHtml: item.labelHtml as string, numberHtml: item.numberHtml as string,
    label: item.label as string, number: item.number as string,
    ...(item.slide === undefined ? {} : { slide: item.slide as string }),
    ...(item.title === undefined ? {} : { title: item.title as string }),
  };
}

/** Проверяем внешний JSON до передачи его механизму разрешения ссылок. */
export function validateImportedCatalog(value: unknown, source: string): Catalog {
  if (!isRecord(value) || value.schema !== "quarto-reference-catalog") {
    throw diagnostic("QRC.IMPORT_INVALID", "неподдерживаемая схема импортированного каталога; ожидается quarto-reference-catalog", { source, field: "schema" });
  }
  keys(value, catalogKeys, `каталог ${source}`, source);
  if (!isRecord(value.generator) || typeof value.generator.quarto !== "string") {
    throw diagnostic("QRC.IMPORT_INVALID", "некорректное поле generator каталога", { source, field: "generator.quarto" });
  }
  keys(value.generator, ["quarto"], `generator каталога ${source}`, source);
  if (!isRecord(value.targets)) throw diagnostic("QRC.IMPORT_INVALID", "некорректное поле targets каталога: ожидается объект", { source, field: "targets" });
  if (value.publication !== undefined) {
    if (!isRecord(value.publication) || !nonempty(value.publication.title)) throw diagnostic("QRC.IMPORT_INVALID", "некорректное поле publication.title каталога", { source, field: "publication.title" });
    keys(value.publication, ["title"], `publication каталога ${source}`, source);
  }
  return {
    schema: "quarto-reference-catalog",
    generator: { quarto: value.generator.quarto },
    ...(value.publication === undefined ? {} : { publication: { title: (value.publication as Record<string, string>).title } }),
    targets: Object.fromEntries(Object.entries(value.targets).map(([key, value]) => [key, target(value, key, source)])),
  };
}
