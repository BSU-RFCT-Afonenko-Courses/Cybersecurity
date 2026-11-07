/** Общее меню: состав Course Site и нативные заголовки страниц Quarto. */
import {
  attr,
  content,
  type Edit,
  type Element,
  elements,
  escape,
  hasClass,
  type Node,
  parseHtml,
  replace,
} from "./html/document.ts";
import { dirname, join, relative } from "stdlib/path";

export interface NavigationMember {
  id: string;
  mount: string;
  title: string;
}
interface Page {
  path: string;
  html: string;
  nodes: Element[];
  reveal: boolean;
}
export interface NavigationComposition {
  stage: string;
  outputs: string[];
  title: string;
  members: NavigationMember[];
}

function fail(detail: string): never {
  throw new Error("NAVIGATION.COMPOSITION_INVALID: " + detail);
}
function outer(page: Page, node: Element): string {
  const loc = node.sourceCodeLocation!;
  return page.html.slice(loc.startOffset, loc.endOffset);
}
function under(node: Element, ancestor: Element): boolean {
  for (
    let p: Element | undefined = node;
    p;
    p = p.parentNode && "tagName" in p.parentNode ? p.parentNode : undefined
  ) if (p === ancestor) return true;
  return false;
}
function pageHref(from: string, page: string): string {
  const path = relative(dirname(from), page).replaceAll("\\", "/").split("/")
    .map(encodeURIComponent).join("/");
  return path.replace(/(^|\/)index\.html$/, "$1") || "./";
}
function headingText(node: Node): string {
  if (
    "tagName" in node &&
    (hasClass(node, "header-section-number") ||
      hasClass(node, "anchorjs-link") || attr(node, "aria-hidden") === "true")
  ) return "";
  if ("value" in node) return node.value;
  return "childNodes" in node ? node.childNodes.map(headingText).join("") : "";
}
function nativeTitle(page: Page): string | undefined {
  const main = page.nodes.find((n) =>
    attr(n, "id") === "quarto-document-content"
  );
  const titleBlock = page.nodes.find((n) =>
    attr(n, "id") === "title-block-header"
  );
  const headings = page.nodes.filter((n) =>
    n.tagName === "h1" && (!main || under(n, main))
  );
  const heading = headings.find((n) => !titleBlock || !under(n, titleBlock)) ||
    headings[0];
  return heading && headingText(heading).replace(/\s+/g, " ").trim() ||
    undefined;
}

export async function composeNavigation(
  context: NavigationComposition,
): Promise<void> {
  if (!context.members.length || context.members[0].mount !== "") {
    fail("Первым участником должен быть корневой портал");
  }
  const ids = new Set<string>(), mounts = new Set<string>();
  for (const member of context.members) {
    if (!member.id || ids.has(member.id) || mounts.has(member.mount)) {
      fail("Повторный или пустой участник: " + member.id);
    }
    if (
      member.mount &&
      (member.mount.startsWith("/") || member.mount.includes("\\") ||
        /^[a-z][a-z0-9+.-]*:/i.test(member.mount) ||
        member.mount.split("/").some((part) =>
          !part || part === "." || part === ".."
        ))
    ) fail("Некорректный путь участника: " + member.mount);
    ids.add(member.id);
    mounts.add(member.mount);
  }
  const realStage = await Deno.realPath(context.stage);
  const pages = new Map<string, Page>();
  for (const output of new Set(context.outputs)) {
    const path = relative(context.stage, output).replaceAll("\\", "/");
    if (path === ".." || path.startsWith("../") || path.startsWith("/")) {
      fail("HTML вне результата сборки: " + output);
    }
    if (path.endsWith(".html")) {
      const real = relative(realStage, await Deno.realPath(output)).replaceAll(
        "\\",
        "/",
      );
      if (real === ".." || real.startsWith("../") || real.startsWith("/")) {
        fail("HTML вне результата сборки через symlink: " + output);
      }
      const html = await Deno.readTextFile(output);
      const nodes = elements(parseHtml(html));
      pages.set(path, {
        path,
        html,
        nodes,
        reveal: nodes.some((n) =>
          n.tagName === "div" && hasClass(n, "reveal")
        ) && /Reveal\.initialize\s*\(/.test(html),
      });
    }
  }
  if (!pages.size) return;
  const entries = context.members.map((member) => {
    const prefix = member.mount ? member.mount.replace(/\/$/, "") + "/" : "";
    let entry = pages.get(prefix + "index.html");
    if (!entry) {
      // Единственная презентация может быть входом без отдельного оглавления.
      const candidates = [...pages.values()].filter((p) =>
        dirname(p.path).replace(/^\.$/, "") === member.mount && p.reveal
      );
      if (candidates.length === 1) entry = candidates[0];
    }
    if (!entry) {
      fail(
        "Нет входной страницы текущей сборки для " + member.id + ": " + prefix +
          "index.html",
      );
    }
    const title = !member.mount ? "Курс" : nativeTitle(entry) || member.title;
    return { ...member, page: entry.path, text: title };
  });
  if (!entries.length || entries[0].mount !== "") {
    fail("Первым участником должен быть корневой портал");
  }
  const presentations = new Set(
    [...pages.values()].filter((p) => p.reveal).map((p) => p.path),
  );
  const updates = new Map<string, string>();
  for (const page of pages.values()) {
    const current = [...entries].sort((a, b) => b.mount.length - a.mount.length)
      .find((e) => !e.mount || page.path.startsWith(e.mount + "/"))!;
    const links = entries.map((e) => ({
      id: e.id,
      text: e.text,
      href: pageHref(page.path, e.page),
      scope: "course",
      path: e.page,
      current: e.id === current.id,
    }));
    const edits: Edit[] = [];
    const json = page.nodes.find((n) =>
      attr(n, "id") === "course-navigation-context"
    );
    if (page.reveal) {
      const existing = json ? JSON.parse(content(json)) : { links: [] };
      const repositories = (existing.links || []).filter((
        link: { scope?: string },
      ) => link.scope === "repository");
      const payload = JSON.stringify({ links: [...links, ...repositories] })
        .replaceAll("<", "\\u003c");
      const script =
        '<script id="course-navigation-context" type="application/json">' +
        payload + "</script>";
      if (json) {
        edits.push({
          start: json.sourceCodeLocation!.startOffset,
          end: json.sourceCodeLocation!.endOffset,
          value: script,
        });
      } else {
        const head = page.nodes.find((n) => n.tagName === "head")!;
        const offset = head.sourceCodeLocation!.endTag!.startOffset;
        edits.push({ start: offset, end: offset, value: script + "\n" });
      }
    } else {
      const header = page.nodes.find((n) => attr(n, "id") === "quarto-header");
      const navbar = header &&
        page.nodes.find((n) =>
          n.tagName === "nav" && hasClass(n, "navbar") && under(n, header)
        );
      if (!navbar) {
        fail(
          "Нет штатной navbar Quarto в " + page.path +
            "; подключите общие metadata навигации",
        );
      }
      const brand = page.nodes.find((n) =>
        hasClass(n, "navbar-brand") && under(n, navbar)
      );
      if (brand) {
        const tag = brand.sourceCodeLocation?.startTag;
        if (tag) {
          const attrs = brand.attrs.filter((a) => a.name !== "href").map((a) =>
            " " + a.name + '="' + escape(a.value) + '"'
          ).join("");
          edits.push({
            start: tag.startOffset,
            end: tag.endOffset,
            value: "<a" + attrs + ' href="' +
              escape(pageHref(page.path, entries[0].page)) + '">',
          });
        }
        const title = page.nodes.find((n) =>
          hasClass(n, "navbar-title") && under(n, brand)
        );
        const target = title || brand;
        const loc = target.sourceCodeLocation;
        if (loc?.startTag && loc.endTag) {
          const logos = title
            ? ""
            : page.nodes.filter((n) => n.tagName === "img" && under(n, brand))
              .map((n) => outer(page, n)).join("");
          edits.push({
            start: loc.startTag.endOffset,
            end: loc.endTag.startOffset,
            value: logos + escape(context.title),
          });
        }
      }
      const lists = page.nodes.filter((n) =>
        n.tagName === "ul" && hasClass(n, "navbar-nav") && under(n, navbar)
      );
      const list = lists.find((n) => hasClass(n, "me-auto")) ||
        lists.find((n) => !hasClass(n, "ms-auto"));
      const menu = links.map((link) =>
        '<li class="nav-item"><a class="nav-link' +
        (link.current ? " active" : "") + '" data-course-link="' +
        escape(link.id) + '" href="' + escape(link.href) + '"' +
        (link.current ? ' aria-current="page"' : "") +
        '><span class="menu-text">' + escape(link.text) + "</span></a></li>"
      ).join("");
      if (
        list?.sourceCodeLocation?.startTag && list.sourceCodeLocation.endTag
      ) {
        const loc = list.sourceCodeLocation;
        edits.push({
          start: loc.startTag!.endOffset,
          end: loc.endTag!.startOffset,
          value: menu,
        });
      } else {
        const collapse = page.nodes.find((n) =>
          hasClass(n, "navbar-collapse") && under(n, navbar)
        );
        const offset = collapse?.sourceCodeLocation?.startTag?.endOffset;
        const listHtml = '<ul class="navbar-nav navbar-nav-scroll me-auto">' +
          menu + "</ul>";
        if (offset !== undefined) {
          edits.push({ start: offset, end: offset, value: listHtml });
        } else {
          // При navbar: {} Quarto не создаёт пустые collapse и toggler.
          const container = page.nodes.find((n) =>
            hasClass(n, "navbar-container") && under(n, navbar)
          ) || navbar;
          const brandContainer = page.nodes.find((n) =>
            hasClass(n, "navbar-brand-container") && under(n, container)
          );
          const insert = brandContainer?.sourceCodeLocation?.endOffset ||
            container.sourceCodeLocation?.startTag?.endOffset;
          if (insert === undefined) {
            fail("Нет позиции штатной navbar Quarto в " + page.path);
          }
          const toggle =
            '<button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarCollapse" aria-controls="navbarCollapse" aria-expanded="false" aria-label="Меню курса"><span class="navbar-toggler-icon"></span></button>';
          edits.push({
            start: insert,
            end: insert,
            value: toggle +
              '<div class="collapse navbar-collapse" id="navbarCollapse">' +
              listHtml + "</div>",
          });
        }
      }
      // При входе в презентацию из оглавления сохраняется открытая страница курса.
      if (page.path.endsWith("index.html")) {
        for (const node of page.nodes) {
          if (
            node.tagName !== "a" || under(node, navbar) || !attr(node, "href")
          ) continue;
          let url: URL;
          try {
            url = new URL(
              attr(node, "href")!,
              "https://navigation.invalid/" +
                page.path.split("/").map(encodeURIComponent).join("/"),
            );
          } catch {
            continue;
          }
          if (url.origin !== "https://navigation.invalid") continue;
          let target: string;
          try {
            target = decodeURIComponent(url.pathname).slice(1);
          } catch {
            continue;
          }
          if (target.endsWith("/")) target += "index.html";
          if (!presentations.has(target)) continue;
          const tag = node.sourceCodeLocation?.startTag;
          if (!tag) continue;
          const rel = [
            ...new Set(
              (attr(node, "rel") || "").split(/\s+/).filter(Boolean).concat([
                "noopener",
                "noreferrer",
              ]),
            ),
          ].join(" ");
          const attrs = node.attrs.filter((a) =>
            a.name !== "target" && a.name !== "rel"
          ).map((a) => " " + a.name + '="' + escape(a.value) + '"').join("");
          edits.push({
            start: tag.startOffset,
            end: tag.endOffset,
            value: "<a" + attrs + ' target="_blank" rel="' + escape(rel) + '">',
          });
        }
      }
    }
    // Результат уже содержит относительные адреса; браузерная перебазировка не нужна.
    const oldScript = page.nodes.find((n) =>
      attr(n, "id") === "course-site-navigation"
    );
    if (oldScript) {
      edits.push({
        start: oldScript.sourceCodeLocation!.startOffset,
        end: oldScript.sourceCodeLocation!.endOffset,
        value: "",
      });
    }
    updates.set(join(context.stage, page.path), replace(page.html, edits));
  }
  // Отсутствующий вход/HTML обнаруживается до изменения готовых страниц.
  for (const [path, html] of updates) await Deno.writeTextFile(path, html);
}
