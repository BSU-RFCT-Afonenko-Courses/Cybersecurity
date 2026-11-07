// Bounded projection of already captured facts. No resolver, file read or legacy hash.
// @deno-types="../vendor/zod/v4/index.d.ts"
import { z } from "../vendor/zod/v4/index.js";
import {
  NativeOperationIdentitySchema,
  NativeWebFormatSchema,
} from "./contracts.ts";
import type { NativeOperationIdentity } from "./contracts.ts";
import {
  decode,
  DocumentContextSchema,
  EarlyDocumentSchema,
} from "../document/contracts.ts";
import {
  NativeProjectFactsCaptureSchema,
  NativeProjectFactSchema,
  NativeProjectMaterializationSchema,
} from "../document/project-facts.ts";
import { bindProjectMaterializations } from "../domain/project-materialization.ts";
import { immutable } from "../document/condition.ts";
import { fail } from "../contracts/project.ts";
const source = z.string().min(1).refine((s) =>
  !s.startsWith("/") && !s.includes("\\") && !s.includes("\0") &&
  s.split("/").every((p) => p && p !== "." && p !== "..")
);
export const NativeAssignmentProvenanceSchema = z.strictObject({
  schema: z.literal("course-native-assignment-provenance-v1"),
  identity: NativeOperationIdentitySchema,
  ownerInputs: z.array(source).min(1),
  capturedInputs: z.array(source).min(1),
  sourceRows: z.array(
    z.strictObject({ source, sha256: z.string().regex(/^[a-f0-9]{64}$/) }),
  ),
  projects: z.array(
    z.strictObject({
      source,
      id: z.string().regex(/^exr-/),
      project: z.string().min(1),
      target: z.string().optional(),
      format: NativeWebFormatSchema,
    }),
  ),
  documents: z.array(z.strictObject({
    source,
    format: NativeWebFormatSchema,
    courseId: z.string().optional(),
    projects: z.array(NativeProjectFactSchema),
    projectChecks: z.unknown().optional(),
    projectMaterializations: z.record(
      z.string(),
      NativeProjectMaterializationSchema,
    ),
  })),
});
export type NativeAssignmentProvenance = z.output<
  typeof NativeAssignmentProvenanceSchema
>;
const capturedEarly = EarlyDocumentSchema.omit({
  ast: true,
  occurrences: true,
});
type Captured = {
  source: string;
  early: z.output<typeof capturedEarly>;
  projectFacts?: z.output<typeof NativeProjectFactsCaptureSchema>;
};
export function buildAssignmentProvenance(
  identity: NativeOperationIdentity,
  ownerInputs: readonly string[],
  capturedInputs: readonly string[],
  rows: readonly { path: string; sha256: string }[],
  documents: readonly Captured[],
): NativeAssignmentProvenance {
  const same = (a: unknown, b: unknown) =>
    JSON.stringify(a) === JSON.stringify(b);
  const unique = (items: readonly string[]) =>
    new Set(items).size === items.length;
  if (
    !ownerInputs.length || !unique(ownerInputs) || !unique(capturedInputs) ||
    !unique(documents.map((d) => d.source)) ||
    ownerInputs.length !== capturedInputs.length ||
    ownerInputs.some((s) => !capturedInputs.includes(s)) ||
    documents.length !== capturedInputs.length ||
    capturedInputs.some((s) => !documents.some((d) => d.source === s))
  ) {
    fail(
      "BODY.PROVENANCE_COVERAGE",
      "Captured documents не покрывают полный qualified owner input scope",
    );
  }
  const projects: NativeAssignmentProvenance["projects"] = [],
    facts: NativeAssignmentProvenance["documents"] = [];
  for (const doc of documents) {
    const frame = doc.projectFacts;
    if (!frame) {
      fail(
        "BODY.PROVENANCE_UNQUALIFIED",
        "Отсутствует native project facts producer",
      );
    }
    const parsed = decode(
      NativeProjectFactsCaptureSchema,
      frame,
      "BODY.PROVENANCE_UNQUALIFIED",
    );
    const ctx = decode(
        DocumentContextSchema,
        doc.early.context,
        "BODY.PROVENANCE_UNQUALIFIED",
      ),
      declared = (doc.early.release?.declarations ?? []).filter((d) =>
        d.project
      );
    if (
      !same(parsed.context, ctx) || parsed.source !== doc.source ||
      ctx.operation !== identity.operation ||
      ctx.projection !== identity.projection ||
      !same(ctx.profiles, identity.profiles) ||
      parsed.projects.length !== declared.length ||
      !unique(parsed.projects.map((p) => p.exerciseId)) || declared.some((d) =>
        !parsed.projects.some((p) =>
          p.exerciseId === d.id && p.source === doc.source &&
          "/" + p.projectRoot === d.project && p.projectCheck === d.check
        )
      )
    ) {
      fail(
        "BODY.PROVENANCE_UNQUALIFIED",
        "Project facts не принадлежат тому же полному preprojection capture",
      );
    }
    const format = decode(
      NativeWebFormatSchema,
      ctx.format,
      "BODY.PROVENANCE_UNQUALIFIED",
    );
    for (const row of declared) {
      projects.push({
        source: doc.source,
        id: row.id,
        project: row.project!,
        ...(row.target ? { target: row.target } : {}),
        format,
      });
    }
    facts.push({
      source: doc.source,
      format,
      ...(doc.early.release?.course?.id
        ? { courseId: doc.early.release.course.id }
        : {}),
      projects: parsed.projects,
      ...(doc.early.release?.nativeMetadata.projectChecks !== undefined
        ? { projectChecks: doc.early.release.nativeMetadata.projectChecks }
        : {}),
      projectMaterializations: parsed.projectMaterializations,
    });
  }
  const bound = bindProjectMaterializations(facts);
  for (const document of facts) {
    document.projects = bound.filter((p) => p.source === document.source);
  }
  if (
    !unique(rows.map((r) => r.path)) ||
    capturedInputs.some((s) => !rows.some((r) => r.path === s))
  ) {
    fail(
      "BODY.PROVENANCE_COVERAGE",
      "Captured source отсутствует в same-S rows",
    );
  }
  return immutable(decode(NativeAssignmentProvenanceSchema, {
    schema: "course-native-assignment-provenance-v1",
    identity,
    ownerInputs: [...ownerInputs],
    capturedInputs: [...capturedInputs],
    sourceRows: rows.map((r) => ({ source: r.path, sha256: r.sha256 })),
    projects,
    documents: facts,
  }, "BODY.PROVENANCE_UNQUALIFIED"));
}
