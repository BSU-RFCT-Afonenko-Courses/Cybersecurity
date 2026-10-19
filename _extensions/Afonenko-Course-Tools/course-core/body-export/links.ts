import type {Node} from "./model.ts";
import {diagnostic, type DiagnosticContext} from "../domain/diagnostics.ts";
import {nativeAttributes} from "./references.ts";
import {posix} from "node:path";
export interface BodyReferenceContext {
  namespace: string;
  sourceUrl?(source: string): string | Promise<string>;
  resolve(key: string, style: string, source: string): {href: string; label: string} | Promise<{href: string; label: string}>;
}
/** Ссылка на само условие определяется по target, а не по текущему файлу. */
export async function publicLinks(blocks: Node[], context: DiagnosticContext,
  references?: BodyReferenceContext): Promise<Node[]> {
  const ids = new Set<string>();
  const attr = (v: any) => v?.t === "Header" ? v.c[1] :
    ["Div", "Span", "CodeBlock", "Code", "Link", "Image", "Figure"].includes(v?.t) ? v.c[0] : undefined;
  const index = (v: any) => {
    if (Array.isArray(v)) v.forEach(index);
    else if (v && typeof v === "object") {
      for (const a of nativeAttributes(v)) if (a?.[0]) ids.add(a[0]);
      Object.values(v).forEach(index);
    }
  };
  index(blocks);
  async function rewrite(value: any): Promise<any> {
    if (Array.isArray(value)) {
      const result = [];
      for (let child of value) {
        const a = attr(child);
        const key = a?.[2]?.find((pair: string[]) => pair[0] === "data-qrc-ref")?.[1];
        if (key) {
          if (!references) throw diagnostic("BODY.QRC_REFERENCE_UNRESOLVED", key + "; требуется публичный resolver QRC", context);
          if (key === references.namespace + ":" + context.id) {
            if (a[2].some((pair: string[]) => pair[0] === "data-qrc-custom" && pair[1] === "true")) {
              result.push(...await rewrite(child.c[1]));
            }
            continue;
          }
          const style = a[2].find((pair: string[]) => pair[0] === "data-qrc-style")?.[1] ?? "default";
          const target = await references.resolve(key, style, context.source!);
          const custom = a[2].find((pair: string[]) => pair[0] === "data-qrc-custom")?.[1] === "true";
          const clean = [a[0], a[1].filter((c: string) => !["qrc-reference", "qrc-link"].includes(c)), a[2].filter((p: string[]) => !p[0].startsWith("data-qrc-"))];
          result.push({t: "Link", c: [clean, custom ? await rewrite(child.c[1]) : [{t: "Str", c: target.label}], [target.href, ""]]});
          continue;
        }
        if (child?.t === "Link") {
          const href = child.c[2][0];
          const relative = !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href);
          const materialPage = !relative || href.startsWith("#") || /\.(?:qmd|html)(?:[?#]|$)/i.test(href);
          if (references && materialPage && /^(?:https?:|\/\/|[^:]*$)/i.test(href)) {
            const sourceUrl = references.sourceUrl;
            if (!sourceUrl) {
              const fragment = href.startsWith("#") ? decodeURIComponent(href.slice(1)) : undefined;
              if (fragment === context.id) {
                result.push(...await rewrite(child.c[1]));
                continue;
              }
              if (!/^https?:\/\//i.test(href) && !(fragment && ids.has(fragment))) {
                throw diagnostic("BODY.PUBLICATION_REQUIRED", "Для ссылки требуется публичный базовый URL", {...context, field: "reference"});
              }
              result.push(await rewrite(child));
              continue;
            }
            const own = new URL(await sourceUrl(context.source!));
            let target = new URL(href, own);
            const path = href.split(/[?#]/)[0];
            if (relative && /\.qmd$/i.test(path)) {
              const source = path.startsWith("/") ? decodeURIComponent(path.slice(1)) :
                posix.normalize(posix.join(posix.dirname(context.source!), decodeURIComponent(path)));
              const output = new URL(await sourceUrl(source));
              output.search = target.search;
              output.hash = target.hash;
              target = output;
            }
            const fragment = decodeURIComponent(target.hash.slice(1));
            const same = target.origin === own.origin && target.pathname === own.pathname;
            if (same && (fragment === context.id || target.searchParams.get("qrc-target") === context.id)) {
              result.push(...await rewrite(child.c[1]));
              continue;
            }
            child = structuredClone(child);
            child.c[2][0] = same && ids.has(fragment) ? "#" + target.hash.slice(1) : target.href;
          } else if (!/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) {
            const native = new URL(href, "https://body.invalid/" + context.source);
            const own = new URL("https://body.invalid/" + context.source);
            const same = native.pathname.replace(/\.(qmd|html)$/, "") === own.pathname.replace(/\.(qmd|html)$/, "");
            if (same && decodeURIComponent(native.hash.slice(1)) === context.id) {
              result.push(...await rewrite(child.c[1]));
              continue;
            }
          }
        }
        result.push(await rewrite(child));
      }
      return result;
    }
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([key, child]) => [key, await rewrite(child)])));
  }
  return await rewrite(structuredClone(blocks));
}
