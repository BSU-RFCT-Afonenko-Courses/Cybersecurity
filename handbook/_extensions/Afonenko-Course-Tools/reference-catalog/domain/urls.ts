import type { Target } from "./model.ts";
/** URL строятся по расположению результатов; домен и префикс Pages не добавляются. */
export function href(from: string, target: Target): string {
  if (target.baseUrl) {
    const local = href("index.html", { ...target, baseUrl: undefined });
    return new URL(local, target.baseUrl).href;
  }
  const source = from.split("/").slice(0, -1);
  const dest = target.page.split("/");
  while (source.length && dest.length && source[0] === dest[0]) { source.shift(); dest.shift(); }
  const path = "../".repeat(source.length) + dest.map(encodeURIComponent).join("/");
  const fragment = encodeURIComponent(target.slide ?? target.fragment);
  const query = target.slide && target.slide !== target.fragment
    ? `?qrc-target=${encodeURIComponent(target.fragment)}` : "";
  return `${path}${query}#${target.slide ? "/" : ""}${fragment}`;
}
