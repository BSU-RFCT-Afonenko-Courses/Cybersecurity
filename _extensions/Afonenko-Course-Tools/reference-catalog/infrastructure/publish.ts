import type { Catalog } from "../domain/model.ts";
import { files, join, relative, dirname, fromFileUrl } from "./files.ts";
import { readPage } from "./pages.ts";
import { linkPages } from "./linker.ts";
import { updateSearch } from "./search.ts";
import { exportedTargets } from "../domain/exports.ts";
import { catalogConfig } from "./config.ts";
import { importTargets } from "./imports.ts";
import { namespacePattern } from "../domain/contract.ts";
import { isRecord } from "./import-config.ts";
/** Входной порт: связывание уже созданных HTML без управления сборкой. */
export interface CatalogPublication {
  root: string; stage: string; quarto: string; config: Record<string, unknown>;
  members: { namespace: string; format: string }[];
  /** Фактический портал, переданный координатором; QRC не управляет его сборкой. */
  portal?: { input: string; output: string };
}
export async function publish(context: CatalogPublication): Promise<void> {
  const { root, stage, quarto, members } = context;
  const extension = dirname(dirname(fromFileUrl(import.meta.url)));
  const htmlMembers = members.filter(member => member.format === "html" || member.format === "revealjs");
  const namespaces = htmlMembers.map(member => member.namespace);
  if (context.portal !== undefined) {
    const raw = context.config["reference-catalog"];
    const namespace = isRecord(raw) ? raw.namespace : undefined;
    if (typeof namespace !== "string" || !namespacePattern.test(namespace)) {
      throw new Error("QRC порталу требуется корректное reference-catalog.namespace");
    }
    if (members.some(member => member.namespace === namespace)) {
      throw new Error(`QRC пространство имён портала совпадает с участником: ${namespace}`);
    }
    namespaces.push(namespace);
  }
  const config = catalogConfig(context.config["reference-catalog"], root, namespaces);
  const imports = await importTargets(config.imports);
  const paths = (await files(stage)).filter(path => path.endsWith(".html"));
  const pages = await Promise.all(paths.map(async path => readPage(relative(stage, path).replaceAll("\\", "/"), await Deno.readTextFile(path))));
  const script = await Deno.readTextFile(join(extension, "browser/navigation.js"));
  const css = await Deno.readTextFile(join(extension, "browser/external.css"));
  const exported = exportedTargets(pages.flatMap(page => page.targets), config.exports);
  const linked = linkPages(pages, script, imports, css);
  // Сначала вычисляется полный результат: ошибка ссылки не оставляет половину страниц обновлёнными.
  for (const [path, html] of linked.pages) await Deno.writeTextFile(join(stage, path), html);
  await updateSearch(stage, (await files(stage)).filter(path => path.endsWith("/search.json")), linked.pages);
  const catalog: Catalog = { schema: "quarto-reference-catalog", generator: { quarto }, publication: config.publication, targets: exported };
  await Deno.writeTextFile(join(stage, "reference-catalog.json"), JSON.stringify(catalog, null, 2) + "\n");
  console.log(`QRC разрешено ссылок: ${linked.links}; целей: ${linked.targets.size}; страниц: ${pages.length}`);
}
