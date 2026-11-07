import { decodeDownloadRequest } from "../domain/request.ts";
import { diagnostic } from "../diagnostics.ts";
const SOURCE = "project-download-native-source";
const classes = new Set([
  "project-download-request",
  "project-download-raw-request",
]);
const fields = new Set([
  SOURCE,
  "project-download-native-batch",
  "project-download-native-result",
  "data-project-download-ordinal",
]);
const dynamic = /\{\{|\}\}|b58fc729-690b-4000-b19f-365a4093b2ff;[a-fA-F0-9]+;/;
function fail(source: string, message: string): never {
  throw diagnostic("DOWNLOAD.DELIVERY_PHASE_UNSUPPORTED", message, { source });
}
function attr(
  value: any,
  expected: string,
  source: string,
  outer = false,
): Record<string, string> {
  if (
    !Array.isArray(value) || value.length !== 3 || value[0] !== "" ||
    !Array.isArray(value[1]) || value[1].length !== 1 ||
    value[1][0] !== expected || !Array.isArray(value[2])
  ) fail(source, "Неподдержанный native shortcode Attr");
  const result: Record<string, string> = {};
  for (const pair of value[2]) {
    if (
      !Array.isArray(pair) || pair.length !== 2 ||
      typeof pair[0] !== "string" || typeof pair[1] !== "string" ||
      Object.hasOwn(result, pair[0])
    ) fail(source, "Неоднозначный native shortcode attribute");
    result[pair[0]] = pair[1];
  }
  const allowed = outer
    ? ["data-is-shortcode", "data-raw"]
    : ["data-is-shortcode", "data-raw", "data-key", "data-value"];
  if (
    Object.keys(result).some((k) => !allowed.includes(k)) ||
    result["data-is-shortcode"] !== "1" ||
    typeof result["data-raw"] !== "string"
  ) fail(source, "Неподдержанные native shortcode attributes");
  return result;
}
function downloadName(v: any): boolean {
  if (
    v?.t !== "Span" || !v.c?.[0]?.[1]?.includes("quarto-shortcode__") ||
    !Array.isArray(v.c?.[1])
  ) return false;
  const first = v.c[1].find((p: any) =>
    p?.t !== "Space" && p?.t !== "SoftBreak"
  );
  return first?.t === "Span" && Array.isArray(first.c?.[0]?.[2]) &&
    first.c[0][2].some((p: any) =>
      Array.isArray(p) && p[0] === "data-value" && p[1] === "project-download"
    );
}
function request(v: any, source: string) {
  attr(v.c[0], "quarto-shortcode__", source, true);
  const positional: string[] = [], named: { key: string; value: string }[] = [];
  let first = true;
  for (const p of v.c[1]) {
    if (
      (p?.t === "Space" || p?.t === "SoftBreak") &&
      Object.keys(p).every((k) => k === "t")
    ) continue;
    if (
      p?.t !== "Span" || !Array.isArray(p.c) || !Array.isArray(p.c[1]) ||
      p.c[1].length
    ) fail(source, "Динамический Download argument");
    const a = attr(p.c[0], "quarto-shortcode__-param", source);
    if (
      typeof a["data-value"] !== "string" || dynamic.test(a["data-value"]) ||
      dynamic.test(a["data-raw"])
    ) fail(source, "Динамический Download argument");
    if (first) {
      if (
        a["data-key"] !== undefined || a["data-value"] !== "project-download"
      ) fail(source, "Неподдержанное имя Download");
      first = false;
      continue;
    }
    if (a["data-key"] !== undefined) {
      if (!a["data-key"] || dynamic.test(a["data-key"])) {
        fail(source, "Динамический Download key");
      }
      named.push({ key: a["data-key"], value: a["data-value"] });
    } else positional.push(a["data-value"]);
  }
  return decodeDownloadRequest({ positional, named }, source);
}
/** Только собственные native body reader Span. Остальной AST и Core guards прежние. */
export function lowerLiteralDownloadRequests(
  document: unknown,
  source: string,
  lower = true,
) {
  if (
    !document || typeof document !== "object" ||
    !Array.isArray((document as any).blocks)
  ) fail(source, "Нет native Pandoc document");
  const doc = document as any;
  function preflight(v: any) {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) {
      if (
        v.length === 3 && typeof v[0] === "string" && Array.isArray(v[1]) &&
        Array.isArray(v[2])
      ) {
        if (
          v[1].some((c: any) => classes.has(c)) ||
          v[2].some((p: any) => Array.isArray(p) && fields.has(p[0]))
        ) fail(source, "Авторский reserved Download marker");
      }
      v.forEach(preflight);
      return;
    }
    for (const [key, value] of Object.entries(v)) {
      if (fields.has(key)) {
        fail(source, "Авторский reserved Download transport");
      }
      preflight(value);
    }
  }
  preflight(doc);
  if (!lower) return doc;
  const replacements: { parent: any; key: string | number; value: any }[] = [];
  function scan(v: any, parent?: any, key?: string | number) {
    if (!v || typeof v !== "object") return;
    if (downloadName(v)) {
      const r = request(v, source);
      replacements.push({
        parent,
        key: key!,
        value: {
          t: "Span",
          c: [["", ["project-download-request"], [
            ["resource", r.resource],
            ...(r.kind === undefined ? [] : [["kind", r.kind]]),
          ]], [{ t: "Str", c: r.text }]],
        },
      });
      return;
    }
    // Другой shortcode сохраняется целиком для прежнего Core отказа.
    if (v.t === "Span" && v.c?.[0]?.[1]?.includes("quarto-shortcode__")) return;
    if (Array.isArray(v)) {
      v.forEach((x, i) => scan(x, v, i));
      return;
    }
    for (const [k, x] of Object.entries(v)) scan(x, v, k);
  }
  scan(doc.blocks);
  for (const r of replacements) r.parent[r.key] = r.value;
  return doc;
}
if (import.meta.main) {
  const ast = JSON.parse(await new Response(Deno.stdin.readable).text()),
    transport = ast.meta?.[SOURCE];
  if (transport?.t !== "MetaString" || typeof transport.c !== "string") {
    fail("", "Отсутствует native Download source");
  }
  const source = transport.c;
  delete ast.meta[SOURCE];
  const mode = Deno.env.get("PROJECT_DOWNLOAD_LITERAL_ONLY");
  if (mode !== undefined && mode !== "1") {
    throw diagnostic(
      "DOWNLOAD.CONFIG_INVALID",
      "Неверный restrictive Download mode",
      { source },
    );
  }
  const result = lowerLiteralDownloadRequests(ast, source, mode === "1");
  await Deno.stdout.write(new TextEncoder().encode(JSON.stringify(result)));
}
