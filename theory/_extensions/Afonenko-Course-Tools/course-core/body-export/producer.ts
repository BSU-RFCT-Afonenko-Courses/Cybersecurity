import { createMetrics as __createMetrics } from "../observability/bridge.ts";
const __metrics = __createMetrics("course-core");
import { diagnostic, type DiagnosticContext } from "../domain/diagnostics.ts";
import { relative, resolve } from "stdlib/path";
import type {
  BodyPackage,
  BodyQuestion,
  Node,
  PublicBodyPackage,
} from "./model.ts";
import { assertReferenceTargets, resolveReferences } from "./references.ts";
import { type BodyReferenceContext, publicLinks } from "./links.ts";
import { BodyPackageSchema } from "./package-contracts.ts";
export type { BodyPackage, PublicBodyPackage } from "./model.ts";
const attr = (n: Node) =>
  n.t === "Header"
    ? n.c[1]
    : ["Div", "Span", "CodeBlock", "Code", "Link", "Image"].includes(n.t)
    ? n.c[0]
    : undefined;
const classes = (n: Node) => attr(n)?.[1] || [];
function titleTargets(value: any): Node[] {
  if (Array.isArray(value)) return value.flatMap(titleTargets);
  if (!value || typeof value !== "object") return [];
  const id = attr(value)?.[0];
  return [
    ...(id ? [{ t: "Span", c: [[id, [], []], []] }] : []),
    ...Object.values(value).flatMap(titleTargets),
  ];
}
const solution = (n: Node) =>
  n.t === "Div" &&
  (classes(n).includes("solution") || attr(n)?.[0]?.startsWith("sol-"));
/** Quarto 1.11.5 HTML markdown pipelines transport navigation/social metadata
 * through these two hidden envelopes. They are not authored public body blocks.
 * Match the pinned writer's whole holder shape; ordinary hidden content stays. */
function quartoMarkdownEnvelope(node: Node): boolean {
  const outer = attr(node);
  if (
    node.t !== "Div" ||
    !["quarto-navigation-envelope", "quarto-meta-markdown"].includes(
      outer?.[0],
    ) ||
    outer[1]?.length !== 1 || outer[1][0] !== "hidden" ||
    outer[2]?.length !== 0 ||
    !Array.isArray(node.c?.[1])
  ) return false;
  const holder = (value: Node) => {
    const a = attr(value);
    return ["Span", "Div"].includes(value?.t) && a?.[0] === "" &&
      a[1]?.length === 2 && a[1].includes("hidden") &&
      a[1].includes("quarto-markdown-envelope-contents") &&
      a[2]?.length === 1 && a[2][0][0] === "render-id" &&
      typeof a[2][0][1] === "string" && a[2][0][1].length > 0 &&
      Array.isArray(value.c?.[1]);
  };
  return node.c[1].every((block: Node) =>
    block?.t === "Div" ? holder(block) : ["Para", "Plain"].includes(block?.t) &&
      block.c?.length === 1 && holder(block.c[0])
  );
}
const omitted = Symbol("omitted");
function partition(value: any, banks: Node[], solutions: Node[]): any {
  if (Array.isArray(value)) {
    return value.map((v) => partition(v, banks, solutions)).filter((v) =>
      v !== omitted
    );
  }
  if (!value || typeof value !== "object") return value;
  if (quartoMarkdownEnvelope(value)) return omitted;
  // Contextual Download links depend on the rendered page/audience. A full ZIP
  // must never become a public question resource, even when it exists on disk.
  if (
    value.t === "Link" &&
    classes(value).some((role: string) =>
      role === "project-download" || role === "project-download-link"
    )
  ) return omitted;
  if (
    value.t === "CodeBlock" && classes(value).includes("answer-spec") ||
    value.t === "Div" && classes(value).includes("answer")
  ) {
    banks.push(value);
    return omitted;
  }
  if (solution(value)) {
    solutions.push(...value.c[1]);
    return omitted;
  }
  if (value.t === "Div" && classes(value).includes("grading-notes")) {
    return omitted;
  }
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k, partition(v, banks, solutions)]),
  );
}
function introduction(value: any): any {
  if (Array.isArray(value)) {
    return value.map(introduction).filter((v) => v !== omitted);
  }
  if (!value || typeof value !== "object") return value;
  if (
    value.t === "Div" && (attr(value)?.[0]?.startsWith("exr-") ||
      classes(value).some((c: string) =>
        ["task-items", "assessment-preview"].includes(c)
      ))
  ) return omitted;
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k, introduction(v)]),
  );
}
const supported = new Set(
  "Str Space SoftBreak LineBreak Emph Strong Underline Strikeout Superscript Subscript SmallCaps Quoted Code Math Link Image Span Para Plain BlockQuote OrderedList BulletList DefinitionList HorizontalRule Table Figure Header Div CodeBlock AlignLeft AlignRight AlignCenter AlignDefault ColWidth ColWidthDefault Decimal DefaultStyle DefaultDelim Period OneParen TwoParens InlineMath DisplayMath SingleQuote DoubleQuote"
    .split(" "),
);
function assertSupported(value: any, context: DiagnosticContext) {
  if (Array.isArray(value)) {
    value.forEach((v) => assertSupported(v, context));
    return;
  }
  if (!value || typeof value !== "object") return;
  const reference = attr(value)?.[2]?.find((pair: string[]) =>
    pair[0] === "data-qrc-ref"
  )?.[1];
  if (reference) {
    throw diagnostic(
      "BODY.QRC_REFERENCE_UNRESOLVED",
      reference + "; Ссылка QRC не разрешена",
      context,
    );
  }
  if (value.t && !supported.has(value.t)) {
    throw diagnostic(
      "BODY.CAPABILITY_UNSUPPORTED",
      "Body не поддерживает этот тип узла: " + value.t,
      context,
    );
  }
  if (
    value.t &&
    classes(value).some((c: string) =>
      ["answer-spec", "correct", "grading-notes", "solution"].includes(c)
    )
  ) {
    throw diagnostic(
      "BODY.UNPARTITIONED_PRIVATE_ROLE",
      "Закрытый блок остался в публичном теле",
      context,
    );
  }
  Object.values(value).forEach((v) => assertSupported(v, context));
}
/** Existing one-scope public links/citations assembly reused by native assignment. */
export async function preparePublicQuestion(
  condition: Node[],
  publicAnswer: Node[],
  document: any,
  root: string,
  context: DiagnosticContext,
  references?: BodyReferenceContext,
  effectiveBase?: string,
) {
  const fragments = await resolveReferences(
    await publicLinks(
      [
        { t: "Div", c: [["", [], []], condition] },
        { t: "Div", c: [["", [], []], publicAnswer] },
      ],
      { ...context, field: "condition/publicAnswer" },
      references,
    ),
    document,
    root,
    { ...context, field: "condition/publicAnswer" },
    effectiveBase,
  );
  const result = {
    condition: [...fragments[0].c[1], ...fragments.slice(2)],
    publicAnswer: fragments[1].c[1],
  };
  assertReferenceTargets([...result.condition, ...result.publicAnswer], {
    ...context,
    field: "condition/publicAnswer",
  });
  assertSupported(result.condition, { ...context, field: "condition" });
  assertSupported(result.publicAnswer, { ...context, field: "publicAnswer" });
  return result;
}
export async function preparePublicIntroduction(
  blocks: Node[],
  document: any,
  root: string,
  context: DiagnosticContext,
  references?: BodyReferenceContext,
  effectiveBase?: string,
) {
  const result = await resolveReferences(
    await publicLinks(introduction(partition(blocks, [], [])), {
      ...context,
      field: "introduction",
    }, references),
    document,
    root,
    { ...context, field: "introduction" },
    effectiveBase,
  );
  assertReferenceTargets(result, { ...context, field: "introduction" });
  assertSupported(result, { ...context, field: "introduction" });
  return result;
}
export async function assertBodyPackage(pkg: BodyPackage, root: string) {
  const parsed = BodyPackageSchema.safeParse(pkg);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw diagnostic("BODY.PACKAGE_INVALID", issue.message, {
      source: root,
      field: issue.path.join("."),
    }, parsed.error);
  }
}

export function publicResourceUses(
  value: any,
  root: string,
  source: string,
  effectiveBase?: string,
  targets?: Map<string, string>,
): string[] {
  const selected: string[] = [];
  function scan(v: any) {
    if (Array.isArray(v)) {
      v.forEach(scan);
      return;
    }
    if (!v || typeof v !== "object") return;
    if (["Image", "Link"].includes(v.t)) {
      const url = v.c[2][0];
      if (
        !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(url) &&
        !/\.(?:qmd|html)(?:[#?]|$)/i.test(url)
      ) {
        if (!effectiveBase) {
          throw diagnostic(
            "BODY.RESOURCE_CONTEXT_REQUIRED",
            "Не найден native контекст ресурса",
            { source, field: "resource" },
          );
        }
        const path = decodeURIComponent(url.split(/[?#]/)[0]);
        const absolute = path.startsWith("/")
          ? resolve(root, path.slice(1))
          : resolve(effectiveBase, path);
        if (targets) {
          const target = targets.get(absolute);
          if (target) {
            v.c[2][0] = target + url.slice(url.split(/[?#]/)[0].length);
          }
        } else selected.push(relative(root, absolute));
      }
    }
    Object.values(v).forEach(scan);
  }
  scan(value);
  return selected;
}

export function publicCondition(blocks: Node[], hasCanonicalTitle: boolean) {
  const authoredCondition = blocks.filter((n: Node) =>
    !(n.t === "Div" && classes(n).includes("course-metadata"))
  );
  const opening = authoredCondition[0], prefix = opening?.c?.[0];
  let prefixTargets: Node[] = [];
  let nativeTitleConsumed = false;
  // Quarto's crossref writer prepends this anonymous caption to the first
  // paragraph. Strip only that native prefix, keeping any authored tail.
  if (
    ["Para", "Plain"].includes(opening?.t) && prefix?.t === "Span" &&
    prefix.c[0][0] === "" && prefix.c[0][1].length === 1 &&
    prefix.c[0][1][0] === "theorem-title" && prefix.c[0][2].length === 0 &&
    prefix.c[1].length === 1 && prefix.c[1][0].t === "Strong"
  ) {
    nativeTitleConsumed = true;
    prefixTargets = titleTargets(prefix);
    const tail: Node[] = opening.c.slice(1);
    while (
      tail.length && (["Space", "SoftBreak", "LineBreak"].includes(tail[0].t) ||
        tail[0].t === "Str" && !tail[0].c.trim())
    ) tail.shift();
    if (tail.length) authoredCondition[0] = { ...opening, c: tail };
    else authoredCondition.shift();
  }
  // The native caption was handled above; remaining Headers are authored.
  // Strip the original canonical Header only when no native prefix occurred.
  if (
    !nativeTitleConsumed && hasCanonicalTitle &&
    authoredCondition[0]?.t === "Header"
  ) {
    const heading = authoredCondition.shift()!;
    // Preserve genuine fragment targets without repeating the book title.
    if (heading.c[1][0]) {
      authoredCondition.unshift({ t: "Div", c: [heading.c[1], []] });
    }
  }
  if (prefixTargets.length) {
    authoredCondition.unshift({ t: "Plain", c: prefixTargets });
  }
  return partition(authoredCondition, [], []);
}
