import { finalizeAssignment } from "./assignment-finalize.ts";
import { fail } from "../contracts/project.ts";
import {
  boundDocument,
  decode,
  EarlyDocumentSchema,
  FinalizedDocumentSchema,
  LateDocumentSchema,
} from "./contracts.ts";
import type {
  EarlyDocument,
  FinalizedDocument,
  LateDocument,
  ResolvedOccurrence,
} from "./contracts.ts";
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
/** Привязка подтверждает позднее присутствие, а не выводит его из отсутствия ID. */
export function finalizeDocument(
  earlyValue: EarlyDocument,
  lateValue: LateDocument,
): FinalizedDocument {
  boundDocument(earlyValue);
  boundDocument(lateValue);
  const early = decode(EarlyDocumentSchema, earlyValue, "DOCUMENT_EARLY"),
    late = decode(LateDocumentSchema, lateValue, "DOCUMENT_LATE");
  if (stable(early.context) !== stable(late.context)) {
    fail(
      "DOCUMENT_BINDING",
      "Чужой operation/input/format/projection",
      early.context.input,
    );
  }
  const expected = new Map(early.occurrences.map((row) => [row.key, row]));
  if (expected.size !== early.occurrences.length) {
    fail("DOCUMENT_BINDING", "Повторный early key", early.context.input);
  }
  const found = new Set<string>(),
    occurrences: ResolvedOccurrence[] = [],
    hasPublicSolution: Record<string, boolean> = {};
  for (const row of late.occurrences) {
    const declaration = expected.get(row.key);
    if (!declaration || found.has(row.key)) {
      fail(
        "DOCUMENT_BINDING",
        "Чужое или повторное позднее появление",
        early.context.input,
        row.key,
      );
    }
    found.add(row.key);
    occurrences.push({ ...declaration, ...row });
    if (declaration.kind === "solution" && declaration.publicSolution) {
      hasPublicSolution[declaration.exerciseId] = true;
    }
  }
  const assignment = finalizeAssignment(early, late, occurrences);
  const unresolved = early.occurrences.filter((row) =>
    row.required && !found.has(row.key)
  );
  return decode(
    FinalizedDocumentSchema,
    {
      status: unresolved.length ? "partial" : "complete",
      pandocApiVersion: early.ast["pandoc-api-version"],
      context: early.context,
      definitions: early.definitions,
      occurrences,
      unresolved,
      hasPublicSolution,
      ...(assignment ? { assignment } : {}),
    },
    "DOCUMENT_FINAL",
    early.context.input,
  );
}
