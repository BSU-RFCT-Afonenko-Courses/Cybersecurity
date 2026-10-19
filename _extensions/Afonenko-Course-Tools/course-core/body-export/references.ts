import {createMetrics as __createMetrics} from "../observability/bridge.ts";
const __metrics=__createMetrics("course-core");
import { dirname, resolve } from "stdlib/path";
import { command, quartoExecutable } from "../infrastructure/process.ts";
import { diagnostic, type DiagnosticContext } from "../domain/diagnostics.ts";

/** Resolve only a partitioned public fragment with the native bibliography engine.
 * Cite.content is supported only after citeproc and a matching generated entry.
 * A book's bibliography/nocite or another question never supplies public refs.
 */
export async function resolveReferences(
  blocks: any[],
  document: any,
  root: string,
  context: DiagnosticContext,
  effectiveBase?: string,
): Promise<any[]> {
  const citations = new Set<string>();
  const citationNodes: any[] = [];
  let reservedEntry = false;
  const walk = (v: any, f: (n: any) => void) => {
    if (Array.isArray(v)) {
      v.forEach((n) => walk(n, f));
      return;
    }
    if (v && typeof v === "object") {
      f(v);
      Object.values(v).forEach((n) => walk(n, f));
    }
  };
  walk(blocks, (n) => {
    if (n.t === "Cite") {
      citationNodes.push(n);
      for (const c of n.c[0]) citations.add(c.citationId);
    }
    if (n.t === "Div" && n.c[0][1].includes("csl-entry")) reservedEntry = true;
  });
  let resolved = blocks;
  if (citations.size) {
    const cwd = effectiveBase ?? dirname(resolve(root, context.source!));
    if (reservedEntry) {
      throw diagnostic(
        "BODY.BIBLIOGRAPHY_COLLISION",
        "Авторский csl-entry конфликтует с native библиографией",
        context,
      );
    }
    // Citeproc also scans metadata (including abstract). Only its citation
    // configuration/data belongs to this selected public question's input.
    const meta: Record<string, any> = {};
    for (
      const key of [
        "bibliography",
        "csl",
        "link-citations",
        "lang",
        "locale",
        "references",
        "citation-abbreviations",
      ]
    ) {
      if (document.meta?.[key] !== undefined) meta[key] = document.meta[key];
    }
    walk(meta, (n) => {
      if (n.t === "Cite") {
        throw diagnostic(
          "BODY.CITATION_UNRESOLVED",
          "Цитата в citation metadata не является публичным участником вопроса",
          context,
        );
      }
    });
    const file = await Deno.makeTempFile({
      dir: cwd,
      prefix: ".course-citations-",
      suffix: ".json",
    });
    try {
      await Deno.writeTextFile(
        file,
        JSON.stringify({
          "pandoc-api-version": document["pandoc-api-version"],
          meta,
          blocks: [{ t: "Para", c: citationNodes }],
        }),
      );
      const witness = JSON.parse(
        await command(quartoExecutable(), [
          "pandoc",
          file,
          "--from=json",
          "--to=json",
          "--citeproc",
        ], cwd),
      );
      const entries = new Set<string>();
      walk(witness.blocks, (n) => {
        if (n.t === "Div" && n.c[0][1].includes("csl-entry")) {
          entries.add(n.c[0][0]);
        }
      });
      if ([...citations].some((id) => !entries.has("ref-" + id))) {
        throw diagnostic(
          "BODY.CITATION_UNRESOLVED",
          "Native citeproc не создал библиографическую запись",
          context,
        );
      }
      // This witness contains no authored bibliography nodes. A successful
      // warning-only unknown citation cannot borrow a forged csl-entry.
      await Deno.writeTextFile(
        file,
        JSON.stringify({
          "pandoc-api-version": document["pandoc-api-version"],
          meta,
          blocks,
        }),
      );
      const output = JSON.parse(
        await command(quartoExecutable(), [
          "pandoc",
          file,
          "--from=json",
          "--to=json",
          "--citeproc",
        ], cwd),
      );
      function translate(v: any): any {
        if (Array.isArray(v)) {
          return v.flatMap((n) =>
            n?.t === "Cite" ? translate(n.c[1]) : [translate(n)]
          );
        }
        if (!v || typeof v !== "object") return v;
        return Object.fromEntries(
          Object.entries(v).map(([k, n]) => [k, translate(n)]),
        );
      }
      resolved = translate(output.blocks);
    } finally {
      await Deno.remove(file);
    }
  }
  return resolved;
}

/** Pandoc Table semantic components carry Attr without a tagged node. */
export function nativeAttributes(node: any): any[] {
  if (node.t === "Header") return [node.c[1]];
  if (node.t === "Table") {
    const [, , , head, bodies, foot] = node.c;
    const rows = [
      ...head[1],
      ...bodies.flatMap((body: any) => [...body[2], ...body[3]]),
      ...foot[1],
    ];
    return [
      node.c[0],
      head[0],
      ...bodies.map((body: any) => body[0]),
      foot[0],
      ...rows.flatMap((
        row: any,
      ) => [row[0], ...row[1].map((cell: any) => cell[0])]),
    ];
  }
  return ["Div", "Span", "CodeBlock", "Code", "Link", "Image", "Figure"]
      .includes(node.t)
    ? [node.c[0]]
    : [];
}

/** Fragment links must resolve inside the complete standalone public question. */
export function assertReferenceTargets(
  blocks: any[],
  context: DiagnosticContext,
) {
  const walk = (v: any, f: (n: any) => void) => {
    if (Array.isArray(v)) {
      v.forEach((n) => walk(n, f));
      return;
    }
    if (v && typeof v === "object") {
      f(v);
      Object.values(v).forEach((n) => walk(n, f));
    }
  };
  const ids = new Set<string>(), targets: string[] = [];
  walk(blocks, (n) => {
    for (const attr of nativeAttributes(n)) {
      if (attr?.[0]) {
        if (ids.has(attr[0])) {
          throw diagnostic(
            "BODY.REFERENCE_TARGET_DUPLICATE",
            "Повторная цель в самостоятельном вопросе: " + attr[0],
            context,
          );
        }
        ids.add(attr[0]);
      }
    }
    if (n.t === "Link" && n.c[2][0].startsWith("#")) {
      targets.push(n.c[2][0].slice(1));
    }
  });
  if (targets.some((id) => !ids.has(id))) {
    throw diagnostic(
      "BODY.REFERENCE_TARGET_MISSING",
      "Ссылка не имеет цели в самостоятельном вопросе",
      context,
    );
  }
}

// @ts-expect-error JS допускает замену function binding; сигнатура публичного API сохраняется.
resolveReferences=__metrics.wrapAsync({id:"course-core.body-export.references.resolveReferences",kind:"phase"},resolveReferences);
// @ts-expect-error JS допускает замену function binding; сигнатура публичного API сохраняется.
assertReferenceTargets=__metrics.wrapSync({id:"course-core.body-export.references.assertReferenceTargets",kind:"phase"},assertReferenceTargets);
