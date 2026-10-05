import { attr, elements, hasClass, parseHtml, type Node } from "./html.ts";
import { relative } from "./files.ts";
function readable(node: Node): string {
  if ("tagName" in node && (["script", "style", "nav", "button"].includes(node.tagName) || hasClass(node, "anchorjs-link"))) return "";
  if ("value" in node) return node.value;
  return "childNodes" in node ? node.childNodes.map(readable).join(" ") : "";
}
/** Штатные индексы созданы до post-render; обновляем их текст из окончательного HTML. */
export async function updateSearch(root: string, indexFiles: string[], pages: Map<string, string>): Promise<void> {
  for (const file of indexFiles) {
    const rows = JSON.parse(await Deno.readTextFile(file));
    if (!Array.isArray(rows)) throw new Error(`QRC неподдерживаемый поисковый индекс ${file}`);
    for (const row of rows) {
      if (typeof row.href !== "string" || typeof row.text !== "string") throw new Error(`QRC неподдерживаемая запись поискового индекса ${file}`);
      const url = new URL(row.href, "https://qrc.invalid/" + relative(root, file));
      const page = pages.get(decodeURIComponent(url.pathname).slice(1));
      if (!page) continue;
      const nodes = elements(parseHtml(page));
      const fragment = decodeURIComponent(url.hash.slice(1));
      const selected = fragment ? nodes.find((n) => attr(n, "id") === fragment) : nodes.find((n) => n.tagName === "main");
      if (selected) row.text = readable(selected).replace(/\s+/g, " ").trim();
    }
    await Deno.writeTextFile(file, JSON.stringify(rows, null, 2) + "\n");
  }
}
