import { fail } from "../contracts/project.ts";
import type { AssignmentProducerProfile } from "../runtime/assignment-producer-profiles.ts";
import type { DocumentContext } from "./contracts.ts";
const stable = (v: unknown): string =>
  JSON.stringify(
    v,
    (_k, x) =>
      x && typeof x === "object" && !Array.isArray(x)
        ? Object.fromEntries(
          Object.entries(x).sort(([a], [b]) => a.localeCompare(b)),
        )
        : x,
  );
function unsupported(s: string): never {
  return fail("BODY.DELIVERY_PHASE_UNSUPPORTED", s);
}
// readqmd.lua/lpegshortcode.lua сохраняют nested shortcode как UUID + hex.
// Это отложенный transport, а не literal для разрешённого handler.
const dynamicLiteral =
  /\{\{|\}\}|b58fc729-690b-4000-b19f-365a4093b2ff;[a-fA-F0-9]+;/;
/** Actual native invocation and literal reader nodes, before shortcode/ConditionalBlock. */
export function qualifyAssignmentProducer(
  ast: any,
  context: DocumentContext,
  profile: AssignmentProducerProfile,
  evidence: any,
) {
  const expected =
    profile.native.producerEvidence[context.format as "html" | "revealjs"];
  if (
    !expected ||
    stable({ ...evidence, format: undefined }) !== stable(expected) ||
    evidence.format !== context.format
  ) unsupported("Native producer order/path/runtime evidence отличается");
  function walk(v: any) {
    if (Array.isArray(v)) {
      v.forEach(walk);
      return;
    }
    if (!v || typeof v !== "object") return;
    if (v.t === "Span" && v.c?.[0]?.[1]?.includes("quarto-shortcode__")) {
      const args: { key?: string; value: string }[] = [];
      for (const param of v.c[1]) {
        // Native reader сохраняет разделители; Quarto не передаёт их handler.
        if (
          (param.t === "Space" || param.t === "SoftBreak") &&
          Object.keys(param).every((key) => key === "t")
        ) continue;
        if (
          param.t !== "Span" ||
          !param.c[0][1].includes("quarto-shortcode__-param") ||
          param.c[1].length
        ) unsupported("Динамический shortcode argument");
        const attrs = Object.fromEntries(param.c[0][2]);
        if (
          Object.keys(attrs).length !== param.c[0][2].length ||
          attrs["data-is-shortcode"] !== "1" ||
          typeof attrs["data-raw"] !== "string" ||
          typeof attrs["data-value"] !== "string" ||
          (attrs["data-key"] !== undefined &&
            (typeof attrs["data-key"] !== "string" || !attrs["data-key"])) ||
          dynamicLiteral.test(attrs["data-value"]) ||
          dynamicLiteral.test(attrs["data-raw"]) ||
          Object.keys(attrs).some((k) =>
            !["data-value", "data-key", "data-is-shortcode", "data-raw"]
              .includes(k)
          )
        ) unsupported("Неподдержанный shortcode argument");
        args.push({ key: attrs["data-key"], value: attrs["data-value"] });
      }
      const first = args.shift();
      if (
        !first || first.key ||
        !profile.native.literalShortcodes.includes(
          first.value as "xref" | "meta",
        )
      ) unsupported("Shortcode не квалифицирован");
      if (first.value === "meta") {
        const title = ast.meta?.title;
        const primitive =
          title?.t === "MetaString" && typeof title.c === "string" ||
          title?.t === "MetaInlines" && Array.isArray(title.c) &&
            title.c.every((n: any) =>
              n.t === "Str" && typeof n.c === "string" || n.t === "Space"
            );
        if (
          args.length !== 1 || args[0].key || args[0].value !== "title" ||
          !primitive
        ) unsupported("meta допускает только публичный примитивный title");
      } else {
        const positional = args.filter((p) => !p.key),
          named = args.filter((p) => p.key);
        if (
          positional.length < 2 || positional.length > 3 || named.length > 1 ||
          named.some((p) => p.key !== "style")
        ) unsupported("xref требует literal namespace/id/label/style");
      }
      return;
    }
    Object.values(v).forEach(walk);
  }
  walk(ast.blocks);
}
