import { inheritNativeValue } from "../runtime/capabilities.ts";
import { fail } from "../contracts/project.ts";
import { boundDocument, decode, FinalizedDocumentSchema } from "./contracts.ts";
import type { FinalizedDocument } from "./contracts.ts";
import {
  ConditionViewSchema,
  ResolvedConditionSchema,
} from "../artifacts/contracts.ts";
import type {
  ConditionView,
  ResolvedCondition,
} from "../artifacts/contracts.ts";
export function immutable<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
}
/** One actual occurrence, never a summary or an early-ID visibility guess. */
export function selectCondition(
  document: FinalizedDocument,
  exerciseId: string,
  view: ConditionView,
): ResolvedCondition {
  boundDocument(document);
  const doc = decode(FinalizedDocumentSchema, document, "CONDITION_DOCUMENT");
  const choice = decode(ConditionViewSchema, view, "CONDITION_SELECTION");
  const projection = typeof choice === "string" ? choice : choice.view;
  if (doc.status !== "complete") {
    fail("CONDITION_INCOMPLETE", "Поздний документ неполон", doc.context.input);
  }
  if (projection !== doc.context.projection) {
    fail("CONDITION_BINDING", "Чужая проекция", doc.context.input);
  }
  const rows = doc.occurrences.filter((r) =>
    r.kind === "exercise" && r.exerciseId === exerciseId &&
    (typeof choice === "string" || !choice.occurrence ||
      choice.occurrence === r.key)
  );
  if (rows.length !== 1) {
    fail(
      "CONDITION_OCCURRENCE",
      "Нужно ровно одно фактически видимое появление; при повторении укажите occurrence",
      doc.context.input,
      exerciseId,
    );
  }
  const body = structuredClone(rows[0].body),
    links = new Set<string>(),
    resources = new Set<string>();
  function visit(v: any) {
    if (!v || typeof v !== "object") return;
    if (v.t === "Link" || v.t === "Image") {
      const url = v.c?.[2]?.[0];
      if (typeof url !== "string" || !url) {
        fail("CONDITION_NODE", "Повреждённый link/image");
      }
      (v.t === "Link" ? links : resources).add(url);
    }
    for (const child of Object.values(v)) {
      if (Array.isArray(child)) {
        for (const c of child) visit(c);
      } else visit(child);
    }
  }
  visit(body);
  const condition = immutable(decode(ResolvedConditionSchema, {
    context: doc.context,
    exerciseId,
    occurrence: rows[0].key,
    anchor: rows[0].anchor,
    ...(doc.definitions[exerciseId]?.project
      ? { project: doc.definitions[exerciseId].project }
      : {}),
    view: projection,
    pandocApiVersion: doc.pandocApiVersion,
    body,
    links: [...links].sort(),
    resources: [...resources].sort(),
  }, "CONDITION_CONTRACT"));
  inheritNativeValue(document, condition);
  return condition;
}
