import { referenceStyles } from "../domain/contract.ts";
import type { Target } from "../domain/model.ts";
import { assemble, resolve } from "../domain/catalog.ts";
import { href } from "../domain/urls.ts";
import type { Page } from "./pages.ts";
import { attr, escape, inner, replace, type Edit } from "./html.ts";
export function linkPages(pages: Page[], navigationScript: string, imports: Target[] = [], externalCss = ""): { pages: Map<string, string>; targets: Map<string, Target>; links: number } {
  const targets = assemble([...pages.flatMap((p) => p.targets), ...imports]);
  const result = new Map<string, string>();
  let links = 0;
  for (const page of pages) {
    const edits: Edit[] = [];
    let externalStyle = false;
    for (const node of page.nodes) {
      const key = attr(node, "data-qrc-ref");
      if (!key) continue;
      if (node.tagName !== "a") throw new Error(`QRC некорректная разметка ссылки в ${page.path}`);
      const target = resolve(targets, key, page.path);
      const requestedStyle = attr(node, "data-qrc-style");
      if (!(referenceStyles as readonly string[]).includes(requestedStyle)) throw new Error(`QRC некорректный стиль ссылки в ${page.path}`);
      const style = requestedStyle === "default" ? target.defaultStyle ?? "default" : requestedStyle;
      if (style === "external" && !target.baseUrl) throw new Error(`QRC стиль external требует импортированной цели: ${key}`);
      const custom = attr(node, "data-qrc-custom") === "true";
      // Внешний каталог предоставляет данные, а не выполняемую разметку.
      // Локальные подписи Quarto и явно написанный автором текст сохраняют HTML.
      const number = target.baseUrl ? escape(target.number) : target.numberHtml;
      const caption = target.baseUrl ? escape(target.label) : target.labelHtml;
      if (style === "number" && !custom && !number) throw new Error(`QRC ${key} не имеет номера; используйте название или задайте текст ссылки`);
      let label = custom ? inner(page.html, node) : style === "number" ? number
        : style === "title" || style === "external" ? escape(target.title ?? target.label) : caption;
      const classes = new Set((attr(node, "class") ?? "").split(/\s+/).filter(Boolean));
      const rel = new Set((attr(node, "rel") ?? "").split(/\s+/).filter(Boolean));
      if (target.baseUrl) rel.add("external");
      if (style === "external") {
        externalStyle = true;
        classes.add("qrc-external");
        label = `<span class="qrc-title">${label}</span><span class="qrc-source"> — ${escape(target.sourceTitle || target.namespace)}</span><span class="qrc-external-marker" aria-hidden="true"> ↗</span>`;
      }
      const attributes = node.attrs.filter((a) => !["href", "class", "rel"].includes(a.name));
      if (classes.size) attributes.push({ name: "class", value: [...classes].join(" ") });
      if (rel.size) attributes.push({ name: "rel", value: [...rel].join(" ") });
      const attrs = attributes.map((a) => `${a.name}="${escape(a.value)}"`).join(" ");
      const loc = node.sourceCodeLocation!;
      edits.push({ start: loc.startOffset, end: loc.endOffset,
        value: `<a ${attrs} href="${escape(href(page.path, target))}">${label}</a>` });
      links++;
    }
    for (const probe of page.probes) {
      const loc = probe.sourceCodeLocation!;
      edits.push({ start: loc.startOffset, end: loc.endOffset, value: "" });
    }
    if (externalStyle && externalCss && !page.nodes.some((n) => attr(n, "data-qrc-external-style") !== undefined)) {
      const head = page.nodes.find((n) => n.tagName === "head")?.sourceCodeLocation?.endTag;
      if (head) edits.push({ start: head.startOffset, end: head.startOffset, value: `<style data-qrc-external-style>${externalCss}</style>\n` });
    }
    // Фрагмент URL может указывать на цель внутри свёрнутого блока.
    // Статические ресурсы без явного закрывающего body сохраняются без изменений.
    const body = page.nodes.find((n) => n.tagName === "body")?.sourceCodeLocation?.endTag;
    if (!body && page.reveal) throw new Error(`QRC отсутствует элемент body в ${page.path}`);
    if (body) {
      // В результатах портала может остаться ранее добавленный скрипт.
      // Заменяем его, чтобы обработчики событий не дублировались.
      for (const script of page.nodes.filter(n => n.tagName === "script" && attr(n, "data-qrc-navigation") !== undefined)) {
        const loc = script.sourceCodeLocation!;
        edits.push({ start: loc.startOffset, end: loc.endOffset, value: "" });
      }
      edits.push({ start: body.startOffset, end: body.startOffset, value: `<script data-qrc-navigation>${navigationScript}</script>\n` });
    }
    result.set(page.path, replace(page.html, edits));
  }
  return { pages: result, targets, links };
}
