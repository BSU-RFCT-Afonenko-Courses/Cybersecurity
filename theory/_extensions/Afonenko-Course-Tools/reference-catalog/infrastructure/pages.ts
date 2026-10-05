import type { Target } from "../domain/model.ts";
import { attr, content, elements, hasClass, inner, parseHtml, type Element, type Node } from "./html.ts";
export interface Page {
  path: string; html: string; nodes: Element[]; targets: Target[];
  probes: Element[]; ids: Map<string, Element[]>; reveal: boolean; root: Node;
}
function slideOf(node: Element): string | undefined {
  let current: Element | undefined = node;
  while (current) {
    if (current.tagName === "section" && hasClass(current, "slide")) {
      const id = attr(current, "id");
      if (!id) throw new Error("QRC слайду, на который ведёт ссылка, необходим явно заданный устойчивый ID");
      return id;
    }
    current = current.parentNode && "tagName" in current.parentNode ? current.parentNode : undefined;
  }
}
export function readPage(path: string, html: string): Page {
  const root = parseHtml(html);
  const nodes = elements(root);
  const probes = nodes.filter((n) => hasClass(n, "qrc-probes"));
  const reveal = nodes.some((n) => hasClass(n, "reveal"));
  const ids = new Map<string, Element[]>();
  for (const node of nodes) {
    const id = attr(node, "id");
    if (id) ids.set(id, [...(ids.get(id) ?? []), node]);
  }
  const targets: Target[] = [];
  for (const container of probes) {
    const namespace = attr(container, "data-qrc-namespace")!;
    const rows = elements(container).filter((n) => hasClass(n, "qrc-probe"));
    const paired = new Map<string, Map<string, { html: string; text: string }>>();
    const titles = new Map<string, string>();
    for (const row of rows) {
      const id = attr(row, "data-qrc-id")!;
      const style = attr(row, "data-qrc-style")!;
      const title = attr(row, "data-qrc-title");
      if (title !== undefined) titles.set(id, title);
      const pair = paired.get(id) ?? new Map();
      if (pair.has(style)) throw new Error(`QRC повторяющаяся ссылка-проба ${namespace}:${id}/${style}`);
      if (style === "number" && elements(row).some((n) => hasClass(n, "qrc-unavailable"))) {
        pair.set(style, { html: "", text: "" }); paired.set(id, pair); continue;
      }
      const links = elements(row).filter((n) => n.tagName === "a" && (hasClass(n, "quarto-xref") || hasClass(n, "qrc-anchor")));
      if (links.length !== 1 || !content(links[0]).trim()) {
        throw new Error(`QRC Quarto не разрешил штатную ссылку ${namespace}:${id}/${style} в ${path}`);
      }
      const link = links[0];
      const url = new URL(attr(link, "href")!, `https://qrc.invalid/${path}`);
      if (decodeURIComponent(url.pathname).slice(1) !== path || decodeURIComponent(url.hash.slice(1)).replace(/^\//, "") !== id) {
        throw new Error(`QRC изменился адрес штатной ссылки для ${namespace}:${id}: ${attr(link, "href")}`);
      }
      pair.set(style, { html: inner(html, link), text: content(link) }); paired.set(id, pair);
    }
    for (const [id, pair] of paired) {
      const anchor = ids.get(id);
      if (anchor?.length !== 1) throw new Error(`QRC для цели ${namespace}:${id} найдено HTML-якорей: ${anchor?.length ?? 0}; файл ${path}`);
      const label = pair.get("default"), number = pair.get("number");
      if (!label || !number) throw new Error(`QRC неполная штатная ссылка-проба ${namespace}:${id}`);
      const slide = reveal ? slideOf(anchor[0]) : undefined;
      if (reveal && !slide) throw new Error(`QRC цель ${id} находится вне слайда в ${path}`);
      targets.push({ namespace, id, page: path, fragment: id, slide,
        labelHtml: label.html, numberHtml: number.html, label: label.text, number: number.text,
        ...(titles.has(id) ? { title: titles.get(id)! } : {}) });
    }
  }
  return { path, html, nodes, targets, probes, ids, reveal, root };
}
