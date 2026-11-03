import { dirname, relative, resolve } from "stdlib/path";
import { fail } from "../contracts/project.ts";
/** Данные оформления private assignment HTML, не разрешение читать CSS. */
type PresentationContext = {
  root: string;
  outputDirectory: string;
  xdg: string;
  format: string;
  outputs?: ReadonlySet<string>;
};
function presentationStylesheet(
  row: any,
  sheet: any,
  context?: PresentationContext,
) {
  if (
    !context ||
    !["html", "revealjs"].includes(context.format) ||
    ![context.root, context.xdg, context.outputDirectory].every((p) =>
      typeof p === "string" && p.startsWith("/") && !p.includes("\0") &&
      resolve(p) === p
    ) ||
    !context.outputDirectory.startsWith(context.root + "/_generated/") ||
    row.content.external !== undefined || row.content.version !== undefined ||
    !sheet || typeof sheet !== "object" || Array.isArray(sheet) ||
    Object.keys(sheet).sort().join(",") !== "attribs,name,path" ||
    typeof sheet.path !== "string" || typeof sheet.name !== "string" ||
    !sheet.attribs || typeof sheet.attribs !== "object" ||
    Array.isArray(sheet.attribs)
  ) return false;
  const attrs = sheet.attribs;
  const syntax = /^quarto-syntax-highlighting(?:-dark)?-[a-f0-9]{32}\.css$/
    .test(sheet.name);
  const compiled = /^(quarto-html|bootstrap)(?:-dark)?-[a-f0-9]{32}\.min\.css$/
    .exec(sheet.name);
  if (syntax) {
    if (
      row.content.name !== "quarto-html" ||
      attrs.id !== "quarto-text-highlighting-styles" ||
      Object.keys(attrs).some((k) => !["id", "class"].includes(k))
    ) return false;
  } else if (compiled) {
    if (
      context.format !== "html" || row.content.name !== compiled[1] ||
      attrs["append-hash"] !== "true" ||
      !["light", "dark"].includes(attrs["data-mode"]) ||
      (compiled[1] === "bootstrap"
        ? attrs.id !== "quarto-bootstrap"
        : attrs.id !== undefined) ||
      Object.keys(attrs).some((k) =>
        !["append-hash", "data-mode", "class", "id"].includes(k)
      )
    ) return false;
  } else return false;
  if (
    attrs.class !== undefined &&
    ![
      "quarto-color-scheme",
      "quarto-color-scheme quarto-color-alternate",
      "quarto-color-scheme-extra",
    ].includes(attrs.class)
  ) return false;
  const path = sheet.path;
  if (!path.startsWith("/") || path.includes("\0") || resolve(path) !== path) {
    return false;
  }
  const cache = context.xdg + "/quarto/sass/";
  if (
    path.startsWith(cache) &&
    /^[a-f0-9]{32}\.css$/.test(path.slice(cache.length))
  ) return true;
  const scratch = context.root + "/.quarto/";
  return path.startsWith(scratch) &&
    /^quarto-session-temp[a-f0-9]+\/(?:sass\/)?[a-zA-Z0-9_-][a-zA-Z0-9._-]*\.css$/
      .test(path.slice(scratch.length));
}
/** Native book navigation references existing output names; не разрешение читать HTML. */
function paginationOutput(row: any, link: any, context?: PresentationContext) {
  if (
    !context || context.format !== "html" ||
    !context.root.startsWith("/") || resolve(context.root) !== context.root ||
    !context.outputDirectory.startsWith(context.root + "/_generated/") ||
    resolve(context.outputDirectory) !== context.outputDirectory ||
    row.content.name !== "website-pagination" ||
    Object.keys(row.content).sort().join(",") !== "links,name" ||
    !link || typeof link !== "object" || Array.isArray(link) ||
    Object.keys(link).sort().join(",") !== "href,rel" ||
    !["next", "prev"].includes(link.rel) || typeof link.href !== "string" ||
    !link.href.startsWith("/") || link.href.startsWith("//") ||
    /[\\\0?#%]/.test(link.href)
  ) return false;
  const target = resolve(context.outputDirectory, "." + link.href);
  return target.startsWith(context.outputDirectory + "/") &&
    target.endsWith(".html") &&
    link.href ===
      "/" + relative(context.outputDirectory, target).replaceAll("\\", "/") &&
    context.outputs?.has(target) === true;
}
/** Quarto JSONL contains declared data/resources, not a loaded-module trace. */
export function assertAssignmentDeclarations(
  rows: unknown,
  input: string,
  known: ReadonlySet<string>,
  presentation?: PresentationContext,
) {
  const invalid = (s: string): never =>
    fail("BODY.PRODUCER_DEPENDENCY_UNQUALIFIED", s);
  if (!Array.isArray(rows) || rows.length > 16384) {
    invalid("Нет bounded native data/resource declarations");
  }
  const path = (v: unknown) => {
    if (typeof v !== "string" || !v || v.includes("\0")) {
      invalid("Повреждённый declared path");
    }
    const name = v as string;
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(name)) {
      invalid("Внешний declared resource вне frozen inputs");
    }
    if (!known.has(resolve(dirname(input), name))) {
      invalid("Неизвестный declared data/resource " + name);
    }
  };
  for (const row of rows as any[]) {
    if (
      !row || typeof row !== "object" || typeof row.type !== "string" ||
      !row.content || typeof row.content !== "object"
    ) invalid("Повреждённая native declaration");
    const c = row.content;
    if (["resources", "supporting", "format-resources"].includes(row.type)) {
      path(c.file);
    } else if (row.type === "file") path(c.path);
    else if (row.type === "html-attachment") path(c.file?.path);
    else if (row.type === "html") {
      for (const field of ["scripts", "stylesheets", "resources"]) {
        if (c[field] !== undefined && !Array.isArray(c[field])) {
          invalid("Повреждённый HTML dependency " + field);
        }
        for (const file of c[field] ?? []) {
          // Не добавляет path в S/K и не разрешает CSS как AST/resource payload.
          if (
            field === "stylesheets" && typeof file?.path === "string" &&
            !known.has(resolve(dirname(input), file.path)) &&
            presentationStylesheet(row, file, presentation)
          ) continue;
          path(file?.path);
        }
      }
      if (c.serviceworkers !== undefined && !Array.isArray(c.serviceworkers)) {
        invalid("Повреждённый serviceworkers");
      }
      for (const worker of c.serviceworkers ?? []) path(worker?.source);
      if (c.links !== undefined && !Array.isArray(c.links)) {
        invalid("Повреждённый HTML dependency links");
      }
      for (const link of c.links ?? []) {
        if (paginationOutput(row, link, presentation)) continue;
        path(link?.href);
      }
    } else if (!["text", "usepackage"].includes(row.type)) {
      invalid("Неизвестный native declaration type " + row.type);
    }
  }
}
