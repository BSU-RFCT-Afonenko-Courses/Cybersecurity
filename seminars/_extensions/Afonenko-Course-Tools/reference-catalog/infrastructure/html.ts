import { parse } from "../vendor/parse5/dist/index.js";
// Минимальный интерфейс адаптера HTML; сторонняя библиотека изолирована в этом модуле.
interface Offset { startOffset: number; endOffset: number }
interface Location extends Offset { startTag?: Offset; endTag?: Offset }
interface Document { nodeName: "#document"; childNodes: Node[] }
interface Text { nodeName: "#text"; value: string }
interface Comment { nodeName: "#comment"; data: string }
export interface Element {
  nodeName: string; tagName: string; attrs: { name: string; value: string }[];
  childNodes: Node[]; parentNode?: Element | Document; sourceCodeLocation?: Location;
}
export type Node = Document | Text | Comment | Element;
export function elements(node: Node): Element[] {
  const out: Element[] = [];
  const visit = (item: Node) => {
    if ("tagName" in item) out.push(item);
    if ("childNodes" in item) item.childNodes.forEach(visit);
  };
  visit(node); return out;
}
export function attr(node: Element, name: string): string | undefined {
  return node.attrs.find((a) => a.name === name)?.value;
}
export function hasClass(node: Element, name: string): boolean {
  return (attr(node, "class") ?? "").split(/\s+/).includes(name);
}
export function content(node: Node): string {
  if ("value" in node) return node.value;
  return "childNodes" in node ? node.childNodes.map(content).join("") : "";
}
export function inner(html: string, node: Element): string {
  const loc = node.sourceCodeLocation;
  if (!loc?.startTag || !loc.endTag) throw new Error(`QRC отсутствуют позиции HTML-элемента ${node.tagName}`);
  return html.slice(loc.startTag.endOffset, loc.endTag.startOffset);
}
export function escape(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
export interface Edit { start: number; end: number; value: string }
export function replace(html: string, edits: Edit[]): string {
  edits.sort((a, b) => b.start - a.start);
  let end = html.length;
  for (const edit of edits) {
    if (edit.end > end) throw new Error("QRC пересекающиеся изменения HTML");
    html = html.slice(0, edit.start) + edit.value + html.slice(edit.end);
    end = edit.start;
  }
  return html;
}
export function parseHtml(html: string) { return parse(html, { sourceCodeLocationInfo: true }) as unknown as Document; }
