import { attr, elements, hasClass, type Element, type Node } from "./html.ts";
import type { Page } from "./pages.ts";
import { relative, isAbsolute } from "./files.ts";
export interface SearchIndex { path: string; mount?: string }
export function searchIndexBase(root: string, index: SearchIndex): string {
  if (index.mount === undefined) return relative(root, index.path).replaceAll("\\", "/");
  const mount = index.mount.replaceAll("\\", "/");
  if (isAbsolute(mount) || /^[a-z][a-z0-9+.-]*:/i.test(mount) || mount.split("/").includes("..")) throw new Error(`QRC некорректный mount поискового индекса: ${index.mount}`);
  return mount === "" ? "search.json" : `${mount.replace(/\/$/, "")}/search.json`;
}
export function readable(node: Node): string {
  if ("tagName" in node && (["script", "style", "nav", "button"].includes(node.tagName) || hasClass(node, "anchorjs-link") || hasClass(node, "qrc-probes"))) return "";
  if ("value" in node) return node.value;
  return "childNodes" in node ? node.childNodes.map(readable).join(" ") : "";
}
/** Штатные индексы созданы до post-render; обновляем их текст из окончательного HTML. */
export async function updateSearch(root: string, indexFiles: (string | SearchIndex)[], pages: Map<string, Page>): Promise<void> {
  // Linking updates the current tree; no second HTML parse is needed.
  const parsed = new Map<string, { main?: Element; ids: Map<string, Element> }>();
  for (const value of indexFiles) {
    const index = typeof value === "string" ? { path: value } : value;
    const file = index.path;
    const rows = JSON.parse(await Deno.readTextFile(file));
    if (!Array.isArray(rows)) throw new Error(`QRC неподдерживаемый поисковый индекс ${file}`);
    for (const row of rows) {
      if (typeof row.href !== "string" || typeof row.text !== "string") throw new Error(`QRC неподдерживаемая запись поискового индекса ${file}`);
      const url = new URL(row.href, "https://qrc.invalid/" + searchIndexBase(root, index));
      const path = decodeURIComponent(url.pathname).slice(1);
      const page = pages.get(path);
      if (!page) continue;
      let selection = parsed.get(path);
      if (!selection) {
        const nodes = elements(page.root);
        const ids = new Map<string, Element>();
        for (const node of nodes) {
          const id = attr(node, "id");
          if (id !== undefined && !ids.has(id)) ids.set(id, node);
        }
        selection = { main: nodes.find((node) => node.tagName === "main"), ids };
        parsed.set(path, selection);
      }
      const fragment = decodeURIComponent(url.hash.slice(1));
      const selected = fragment ? selection.ids.get(fragment) : selection.main;
      if (selected) row.text = readable(selected).replace(/\s+/g, " ").trim();
    }
    await Deno.writeTextFile(file, JSON.stringify(rows, null, 2) + "\n");
  }
}
