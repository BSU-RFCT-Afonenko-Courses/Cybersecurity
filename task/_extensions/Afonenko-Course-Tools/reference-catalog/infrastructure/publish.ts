import type { Catalog, Exports } from "../domain/model.ts";
import { join, relative, dirname, fromFileUrl, resolve, isAbsolute } from "./files.ts";
import { readPage } from "./pages.ts";
import { linkPages, type LinkScope } from "./linker.ts";
import { updateSearch, searchIndexBase, type SearchIndex } from "./search.ts";
import { exportedTargets } from "../domain/exports.ts";
import { catalogConfig } from "./config.ts";
import { importTargets } from "./imports.ts";
import { namespacePattern } from "../domain/contract.ts";
import { isRecord } from "./import-config.ts";
/** Входной порт: связывание уже созданных HTML без управления сборкой. */
export interface CatalogPublication {
  root: string; stage: string; quarto: string; config: Record<string, unknown>;
  members: { namespace: string; format: string }[];
  /** Самостоятельный native проект не подтверждает полноту всего курса. */
  scope?: LinkScope;
  /** Текущие native outputs относительно root (или абсолютные) в обоих режимах. */
  outputs: string[];
  /** Явные текущие поисковые индексы; полный режим объединяет их в root search. */
  searchIndexes?: SearchIndex[];
  /** Фактический портал, переданный координатором; QRC не управляет его сборкой. */
  portal?: { input: string; output: string };
}
async function currentFiles(root: string, stage: string, outputs: string[] | undefined, local: boolean): Promise<string[]> {
  if (!outputs) throw new Error("QRC требует явный список текущих outputs");
  const actualStage = await Deno.realPath(stage);
  const paths = [...new Set(outputs.map(path => resolve(root, path)))];
  for (const path of paths) {
    const within = relative(stage, path);
    if (isAbsolute(within) || within === ".." || within.startsWith("../") || within.startsWith("..\\")) throw new Error(`QRC output вне текущего stage: ${path}`);
    const stat = await Deno.lstat(path);
    if (stat.isSymlink || !stat.isFile) throw new Error(`QRC output должен быть обычным файлом: ${path}`);
    const actual = relative(actualStage, await Deno.realPath(path));
    if (isAbsolute(actual) || actual === ".." || actual.startsWith("../") || actual.startsWith("..\\")) throw new Error(`QRC output вне текущего stage: ${path}`);
  }
  const search = join(stage, "search.json");
  if (local) try {
    const stat = await Deno.lstat(search);
    if (stat.isSymlink || !stat.isFile) throw new Error(`QRC output должен быть обычным файлом: ${search}`);
    if (!paths.includes(search)) paths.push(search);
  } catch (error) { if (!(error instanceof Deno.errors.NotFound)) throw error; }
  return paths;
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
  const imports = await importTargets(config.imports, { allowMissingLocal: context.scope === "local" });
  const stageFiles = await currentFiles(root, stage, context.outputs, context.scope === "local");
  const indexes = context.searchIndexes ?? stageFiles.filter(path => path.endsWith("/search.json")).map(path => ({ path }));
  if (indexes.length) await currentFiles(root, stage, indexes.map(index => index.path), false);
  const paths = stageFiles.filter(path => path.endsWith(".html"));
  const pages = await Promise.all(paths.map(async path => readPage(relative(stage, path).replaceAll("\\", "/"), await Deno.readTextFile(path))));
  const script = await Deno.readTextFile(join(extension, "browser/navigation.js"));
  const css = await Deno.readTextFile(join(extension, "browser/external.css"));
  const localTargets = pages.flatMap(page => page.targets);
  const available = new Set(localTargets.map(target => `${target.namespace}:${target.id}`));
  const selection: Exports | undefined = context.scope === "local" && config.exports !== undefined
    ? Object.fromEntries(Object.entries(config.exports).map(([namespace, ids]) => [namespace, ids === "*" ? ids : ids.filter(id => available.has(`${namespace}:${id}`))]))
    : config.exports;
  const exported = exportedTargets(localTargets, selection);
  const linked = linkPages(pages, script, imports, css, context.scope);
  // Сначала вычисляется полный результат: ошибка ссылки не оставляет половину страниц обновлёнными.
  for (const [path, html] of linked.pages) await Deno.writeTextFile(join(stage, path), html);
  const currentIndexes = indexes.map(index => ({ ...index, path: resolve(root, index.path) }));
  await updateSearch(stage, currentIndexes, linked.parsedPages);
  if (context.scope !== "local" && indexes.length) {
    const rows = new Map<string, Record<string, unknown>>();
    for (const index of currentIndexes) {
      const path = index.path;
      const sourceRows = JSON.parse(await Deno.readTextFile(path));
      for (const row of sourceRows) {
        const base = searchIndexBase(stage, index);
        const url = new URL(row.href, `https://qrc.invalid/${base}`);
        if (url.origin !== "https://qrc.invalid") throw new Error(`QRC внешний адрес в локальном поисковом индексе: ${row.href}`);
        if (!linked.parsedPages.has(decodeURIComponent(url.pathname).slice(1))) continue;
        const href = url.pathname.slice(1) + url.search + url.hash;
        rows.set(href, { ...row, href });
      }
    }
    await Deno.writeTextFile(join(stage, "search.json"), JSON.stringify([...rows.values()], null, 2) + "\n");
  }
  const catalog: Catalog = { schema: "quarto-reference-catalog", generator: { quarto }, publication: config.publication, targets: exported };
  await Deno.writeTextFile(join(stage, context.scope === "local" ? "reference-catalog-local.json" : "reference-catalog.json"), JSON.stringify(catalog, null, 2) + "\n");
  console.log(`QRC разрешено ссылок: ${linked.links}; отложено ссылок: ${linked.deferred}; целей: ${linked.targets.size}; страниц: ${pages.length}`);
}
