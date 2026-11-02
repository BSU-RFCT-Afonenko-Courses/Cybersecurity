import { fail } from "../contracts/project.ts";
import {
  assignmentAnchorAttribute,
  assignmentAnswerAttribute,
} from "./assignment-primary.ts";
import type {
  EarlyDocument,
  LateDocument,
  ResolvedOccurrence,
} from "./contracts.ts";
import type { AssignmentEarly } from "./assignment-contracts.ts";
const bad = (s: string): never => fail("BODY.ANSWER_OCCURRENCE_MISMATCH", s);
const attr = (n: any) =>
  ["Div", "Span", "CodeBlock"].includes(n?.t) ? n.c?.[0] : undefined;
const field = (n: any, key: string) =>
  attr(n)?.[2]?.find(([k]: string[]) => k === key)?.[1];
function walk(v: any, visit: (v: any) => void) {
  if (Array.isArray(v)) v.forEach((x) => walk(x, visit));
  else if (v && typeof v === "object") {
    visit(v);
    Object.values(v).forEach((x) => walk(x, visit));
  }
}
function clean(v: any, removeAnswer = false): any {
  if (Array.isArray(v)) {
    return v.map((x) => clean(x, removeAnswer)).filter((x) => x !== undefined);
  }
  if (!v || typeof v !== "object") return v;
  if (removeAnswer && field(v, assignmentAnswerAttribute)) return undefined;
  const out = Object.fromEntries(
    Object.entries(v).map(([k, x]) => [k, clean(x, removeAnswer)]),
  );
  const a = attr(out);
  if (a) {
    a[2] = a[2].filter(([k]: string[]) =>
      k !== assignmentAnchorAttribute && k !== assignmentAnswerAttribute
    );
  }
  return out;
}
export function finalizeAssignment(
  early: EarlyDocument,
  late: LateDocument,
  occurrences: ResolvedOccurrence[],
) {
  if (!early.assignment) {
    if (late.assignment) bad("Неожиданный assignment producer");
    return undefined;
  }
  if (!late.assignment) {
    fail(
      "BODY.ASSESSMENT_OCCURRENCE_MISMATCH",
      "Отсутствует late assignment transport",
    );
  }
  const introductions: Record<string, unknown[]> = {},
    found = new Set<string>();
  for (const row of late.assignment.introductions) {
    const expected = early.assignment.introductions.find((v) =>
      v.key === row.key && v.id === row.id
    );
    if (!expected || found.has(row.key)) {
      fail(
        "BODY.ASSESSMENT_OCCURRENCE_MISMATCH",
        "Чужое/повторное late introduction",
      );
    }
    found.add(row.key);
    introductions[row.id] = clean(row.body);
  }
  if (found.size !== early.assignment.introductions.length) {
    fail(
      "BODY.ASSESSMENT_OCCURRENCE_MISMATCH",
      "Missing selected introduction marker",
    );
  }
  const answers: Record<
    string,
    {
      type: AssignmentEarly["answers"][string]["type"];
      declared: boolean;
      publicAnswer: unknown[];
      responseSlots: AssignmentEarly["answers"][string]["responseSlots"];
    }
  > = {};
  for (const [id, expected] of Object.entries(early.assignment.answers)) {
    const candidates = occurrences.filter((v) =>
      v.kind === "exercise" && v.exerciseId === id
    );
    if (candidates.length !== 1) {
      bad("Требуется ровно один exercise occurrence " + id);
    }
    const row = candidates[0], wrappers: any[] = [];
    walk(row.body, (v) => {
      const key = field(v, assignmentAnswerAttribute);
      if (key !== undefined) {
        if (v.t !== "Div" || key !== expected.key) bad("Чужой answer witness");
        wrappers.push(v);
      }
    });
    if (wrappers.length !== 1) bad("Missing/duplicate answer wrapper " + id);
    const anchors: string[] = [];
    walk(wrappers[0].c[1], (v) => {
      const key = field(v, assignmentAnchorAttribute);
      if (key !== undefined) {
        if (attr(v)?.[0] !== key) bad("Answer anchor/identity mismatch");
        anchors.push(key);
      }
    });
    if (JSON.stringify(anchors) !== JSON.stringify(expected.anchors)) {
      bad("Option/part/prompt cardinality/order mismatch " + id);
    }
    for (const slot of expected.responseSlots) {
      if (slot.labelAnchor) {
        let label: any;
        walk(wrappers[0].c[1], (v) => {
          if (attr(v)?.[0] === slot.labelAnchor) label = v;
        });
        let content = false;
        walk(label?.c?.[1], (v) => {
          if (
            ["Str", "Image", "Math", "Code", "CodeBlock"].includes(v.t) &&
            v.c !== "" && JSON.stringify(v.c) !== "[]"
          ) content = true;
        });
        if (!content) {
          bad("Публичный label исчез после native projection " + id);
        }
      }
    }
    answers[id] = {
      type: expected.type,
      declared: expected.declared,
      publicAnswer: clean(wrappers[0].c[1]),
      responseSlots: structuredClone(expected.responseSlots),
    };
    row.body = clean(row.body, true);
  }
  const { introductions: _earlyIntro, answers: _earlyAnswers, ...rest } =
    early.assignment;
  return { ...rest, introductions, answers };
}
