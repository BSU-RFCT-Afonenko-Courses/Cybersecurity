import { fail } from "../contracts/project.ts";
import type { DocumentContext } from "./contracts.ts";
import type { AnswerFacts } from "./answer-contracts.ts";
import type {
  AssignmentEarly,
  NativeResponseSlot,
} from "./assignment-contracts.ts";
export const assignmentAnswerAttribute = "data-course-core-answer";
export const assignmentAnchorAttribute = "data-course-core-answer-anchor";
export const assignmentIntroductionAttribute = "data-course-core-assessment";
const attr = (v: any) =>
  ["Div", "Span", "CodeBlock"].includes(v?.t) ? v.c?.[0] : undefined;
const para = (s: string) => ({ t: "Para", c: [{ t: "Str", c: s }] });
/** Labels/placeholder anchors carry only public identity, never canonical keys. */
export function assignmentAnswerTransport(
  id: string,
  facts: AnswerFacts | undefined,
  blocks: any[],
  context: DocumentContext,
  record: AssignmentEarly["answers"],
) {
  const base = `course-response-${context.operation}-${id}`,
    key = `${context.operation}:${context.captureWitness}:answer:${id}`;
  const anchors: string[] = [], responseSlots: NativeResponseSlot[] = [];
  const span = (anchor: string, body: any[]) => {
    anchors.push(anchor);
    return {
      t: "Span",
      c: [[anchor, [], [[assignmentAnchorAttribute, anchor]]], body],
    };
  };
  const label = (anchor: string, body: any[]) => {
    anchors.push(anchor);
    return {
      t: "Div",
      c: [[anchor, [], [[assignmentAnchorAttribute, anchor]]], body],
    };
  };
  const placeholder = (
    name: string,
    type: NativeResponseSlot["type"],
    rest: Partial<NativeResponseSlot> = {},
  ) => {
    const anchor = base + "-response-" + responseSlots.length;
    responseSlots.push({ name, type, anchor, ...rest });
    return span(anchor, [{ t: "Str", c: "____________________" }]);
  };
  const simple = (
    name: string,
    type: "manual" | "numeric",
    text = "Ответ: ",
    labelAnchor?: string,
  ) => ({
    t: "Para",
    c: [
      { t: "Str", c: text },
      placeholder(name, type, labelAnchor ? { labelAnchor } : {}),
    ],
  });
  let body: any[];
  if (facts?.type === "single-choice") {
    const items = blocks[0]?.t === "BulletList" ? blocks[0].c : undefined;
    if (!Array.isArray(items) || items.length !== facts.count) {
      fail(
        "BODY.ANSWER_OCCURRENCE_MISMATCH",
        "Не совпадает canonical option cardinality",
      );
    }
    body = [{
      t: "BulletList",
      c: items.map((item: any[], ordinal: number) => {
        const labelAnchor = base + "-option-" + ordinal,
          wrapped = label(labelAnchor, item);
        return [wrapped, {
          t: "Para",
          c: [placeholder("answer", "single-choice", { ordinal, labelAnchor })],
        }];
      }),
    }];
  } else if (facts?.type === "multipart") {
    body = facts.parts.flatMap((part, i) => {
      const labelAnchor = base + "-part-" + i;
      return [
        label(labelAnchor, [para(part.label)]),
        simple(part.name, part.type, "Ответ: ", labelAnchor),
      ];
    });
  } else if (facts?.type === "matching") {
    const options = facts.options.map((text, ordinal) => ({
      anchor: base + "-option-" + ordinal,
      ordinal,
      text,
    }));
    // Keep DOM order identical to the expected anchor sequence recorded below.
    const promptBlocks = facts.prompts.map((text, ordinal) => {
      const labelAnchor = base + "-prompt-" + ordinal;
      return [label(labelAnchor, [para(text)]), {
        t: "Para",
        c: [
          placeholder("match-" + ordinal, "matching", {
            ordinal,
            labelAnchor,
            options: options.map(({ anchor, ordinal }) => ({
              anchor,
              ordinal,
            })),
          }),
        ],
      }];
    });
    const optionBlocks = options.map((
      { anchor, text },
    ) => [label(anchor, [para(text)])]);
    body = [
      para("Условия"),
      { t: "BulletList", c: promptBlocks },
      para("Варианты"),
      { t: "BulletList", c: optionBlocks },
    ];
  } else {body = [
      simple("answer", facts?.type === "numeric" ? "numeric" : "manual"),
    ];}
  record[id] = {
    type: facts?.type ?? "manual",
    declared: facts !== undefined,
    key,
    anchors,
    responseSlots,
  };
  return [{
    t: "Div",
    c: [["", [], [[assignmentAnswerAttribute, key]]], body],
  }];
}
/** Audience is projected once before Quarto ConditionalBlock destroys reader content. */
export function assignmentPrivacy(
  value: any,
  context: DocumentContext,
  identityNodes: WeakSet<object>,
): any {
  if (Array.isArray(value)) {
    return value.map((v) => assignmentPrivacy(v, context, identityNodes))
      .filter((v) => v !== undefined);
  }
  if (!value || typeof value !== "object") return value;
  const a = attr(value);
  if (a) {
    const pairs: string[][] = a[2], classes: string[] = a[1];
    if (
      classes.includes("content-visible") && classes.includes("content-hidden")
    ) fail("BODY.DELIVERY_PHASE_UNSUPPORTED", "Неоднозначный audience gate");
    const profilePairs = pairs.filter(([k]) =>
      k === "when-profile" || k === "unless-profile"
    );
    if (profilePairs.length) {
      const seen = new Set<string>();
      let p = true, effective = 0;
      for (const [name, profile] of profilePairs) {
        if (seen.has(name) || !/^[-a-z0-9]+$/.test(profile)) {
          fail(
            "BODY.DELIVERY_PHASE_UNSUPPORTED",
            "Неподдержанный profile predicate",
          );
        }
        seen.add(name);
        const match = profile === "student"
          ? true
          : profile === "full"
          ? false
          : (context.profiles ?? []).includes(profile);
        // Only audience gating on exercise identity/necessary ancestors is overridden.
        if (
          !(identityNodes.has(value) &&
            (profile === "student" || profile === "full"))
        ) {
          effective++;
          p &&= name === "when-profile" ? match : !match;
        }
      }
      a[2] = pairs.filter(([k]) =>
        k !== "when-profile" && k !== "unless-profile"
      );
      const visible = classes.includes("content-visible"),
        hidden = classes.includes("content-hidden");
      if (effective === 0) {
        if (!a[2].some(([k]: string[]) => /^when-|^unless-/.test(k))) {
          a[1] = classes.filter((c) =>
            c !== "content-visible" && c !== "content-hidden"
          );
        }
      } else {
        if (!visible && !hidden) {
          fail(
            "BODY.DELIVERY_PHASE_UNSUPPORTED",
            "Profile attrs вне native conditional gate",
          );
        }
        if (
          visible && !p ||
          hidden && p &&
            !a[2].some(([k]: string[]) => /^when-|^unless-/.test(k))
        ) return undefined;
        if (hidden && !p) {
          a[2] = a[2].filter(([k]: string[]) => !/^when-|^unless-/.test(k));
        }
        const keep = (visible && p || hidden && p) &&
          a[2].some(([k]: string[]) => /^when-|^unless-/.test(k));
        if (!keep) {
          a[1] = classes.filter((c) =>
            c !== "content-visible" && c !== "content-hidden"
          );
        }
      }
    }
    if (
      classes.some((c) =>
        ["solution", "answer-spec", "grading-notes", "rubric", "hints"]
          .includes(c)
      ) || String(a[0]).startsWith("sol-")
    ) return undefined;
  }
  if (value.t === "Note") {
    fail(
      "BODY.CAPABILITY_UNSUPPORTED",
      "Retained Note не поддержан в assignment",
    );
  }
  return Object.fromEntries(
    Object.entries(value).map((
      [k, v],
    ) => [k, assignmentPrivacy(v, context, identityNodes)]),
  );
}
