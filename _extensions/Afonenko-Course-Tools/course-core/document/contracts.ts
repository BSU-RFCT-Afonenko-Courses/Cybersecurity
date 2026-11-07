import {
  AssignmentEarlySchema,
  AssignmentFinalSchema,
  AssignmentLateSchema,
} from "./assignment-contracts.ts";
// @deno-types="../vendor/zod/v4/index.d.ts"
import { z } from "../vendor/zod/v4/index.js";
import { NativeReleaseFactsSchema } from "../release/contracts.ts";
import { boundInput, fail } from "../contracts/project.ts";
export const ExerciseDeclarationSchema = z.strictObject({
  difficulty: z.enum(["introductory", "intermediate", "advanced"]),
  "statement-visibility": z.enum(["open", "restricted"]),
  "course-role": z.enum([
    "demonstration",
    "discussion",
    "independent-study",
    "control",
  ]).optional(),
  time: z.number().int().positive().max(100000).optional(),
  project: z.string().min(1).max(1024).optional(),
  target: z.string().min(1).max(80).optional(),
  "project-check": z.string().regex(/^[a-z][a-z0-9-]*$/).optional(),
});
export type ExerciseDeclaration = z.output<typeof ExerciseDeclarationSchema>;
export const DocumentContextSchema = z.strictObject({
  operation: z.uuid(),
  captureWitness: z.uuid().optional(),
  profiles: z.array(z.string()).max(16).default([]),
  input: z.string().min(1).max(4096),
  format: z.string().regex(/^[-a-z0-9]+$/),
  projection: z.enum(["student", "author"]),
  exerciseBank: z.boolean(),
  defaults: ExerciseDeclarationSchema.partial().default({}),
});
export type DocumentContext = z.input<typeof DocumentContextSchema>;
export const PandocDocumentSchema = z.strictObject({
  "pandoc-api-version": z.array(z.number().int().nonnegative()).min(2).max(4),
  meta: z.record(z.string(), z.unknown()),
  blocks: z.array(z.unknown()),
});
export const OccurrenceSchema = z.strictObject({
  key: z.string().min(1),
  kind: z.enum(["exercise", "solution"]),
  exerciseId: z.string().regex(/^exr-[a-z0-9][a-z0-9-]*$/),
  required: z.boolean(),
  publicSolution: z.boolean(),
});
export const EarlyDocumentSchema = z.strictObject({
  context: DocumentContextSchema,
  ast: PandocDocumentSchema,
  definitions: z.record(z.string(), ExerciseDeclarationSchema),
  occurrences: z.array(OccurrenceSchema).max(4096),
  release: NativeReleaseFactsSchema.optional(),
  assignment: AssignmentEarlySchema.optional(),
  authorityCost: z.record(
    z.enum([
      "authorityDataReads",
      "authorityHashBytes",
      "authorityGraphHashReads",
      "authorityGraphHashBytes",
      "authorityPathReads",
      "authorityDirectoryReads",
      "authorityTopologyBytes",
    ]),
    z.number().int().nonnegative(),
  ).optional(),
});
export type EarlyDocument = z.output<typeof EarlyDocumentSchema>;
export const LateOccurrenceSchema = z.strictObject({
  key: z.string().min(1),
  body: z.array(z.unknown()),
  nativeKind: z.string().min(1),
  anchor: z.string(),
  title: z.array(z.unknown()).optional(),
});
export const LateDocumentSchema = z.strictObject({
  context: DocumentContextSchema,
  occurrences: z.array(LateOccurrenceSchema).max(4096),
  assignment: AssignmentLateSchema.optional(),
});
export type LateDocument = z.input<typeof LateDocumentSchema>;
export const ResolvedOccurrenceSchema = OccurrenceSchema.extend(
  LateOccurrenceSchema.shape,
);
export type ResolvedOccurrence = z.output<typeof ResolvedOccurrenceSchema>;
export const FinalizedDocumentSchema = z.strictObject({
  pandocApiVersion: z.array(z.number().int().nonnegative()).min(2).max(4),
  status: z.enum(["complete", "partial"]),
  context: DocumentContextSchema,
  definitions: z.record(z.string(), ExerciseDeclarationSchema),
  occurrences: z.array(ResolvedOccurrenceSchema).max(4096),
  unresolved: z.array(OccurrenceSchema).max(4096),
  hasPublicSolution: z.record(z.string(), z.boolean()),
  assignment: AssignmentFinalSchema.optional(),
});
export type FinalizedDocument = z.output<typeof FinalizedDocumentSchema>;
export function decode<T>(
  schema: z.ZodType<T>,
  value: unknown,
  code: string,
  source?: string,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    fail(code, issue.message, source, issue.path.join("."));
  }
  return parsed.data;
}
/** AST может быть больше договора; всё ещё bounded, а JSON циклы запрещены. */
export function boundDocument(value: unknown) {
  let count = 0;
  const active = new Set<object>();
  function visit(v: unknown, depth: number) {
    if (++count > 200000 || depth > 128) {
      fail("DOCUMENT_LIMIT", "Слишком большой/глубокий AST");
    }
    if (typeof v === "string" && v.length > 4 * 1024 * 1024) {
      fail("DOCUMENT_LIMIT", "Слишком длинная строка AST");
    }
    if (v && typeof v === "object") {
      if (active.has(v)) fail("DOCUMENT_LIMIT", "Циклический AST");
      active.add(v);
      for (const [k, c] of Object.entries(v)) {
        if (["__proto__", "constructor", "prototype"].includes(k)) {
          fail("DOCUMENT_LIMIT", "Недопустимое имя поля AST");
        }
        visit(c, depth + 1);
      }
      active.delete(v);
    }
  }
  visit(value, 0);
}
export function decodeDocumentContext(value: unknown) {
  boundInput(value);
  return decode(DocumentContextSchema, value, "DOCUMENT_CONTEXT");
}
