// Единственный TS owner generic project facts; PL check normalization остаётся у адаптера.
// @deno-types="../vendor/zod/v4/index.d.ts"
import { z } from "../vendor/zod/v4/index.js";
import { DocumentContextSchema } from "./contracts.ts";
import { posix } from "node:path";
export const NativeProjectMaterializationSchema = z.strictObject({
  commonFiles: z.array(
    z.strictObject({
      source: z.string(),
      target: z.string(),
      audience: z.enum(["student", "grading"]),
    }),
  ),
  includeGit: z.boolean().optional(),
}).superRefine((value, context) => {
  const safe = (path: string) =>
    !!path && !/^[\/\\]/.test(path) && !/[\\\0:*?\[\]{}]/.test(path) &&
    path.split("/").every((p) => p && p !== "." && p !== ".." && p !== ".git");
  const privateNames = new Set([
    "private",
    "reference",
    "solution",
    "solutions",
    "grading-notes",
    "rubric.md",
    "contract.md",
  ]);
  const targets = new Set<string>();
  for (const [i, file] of value.commonFiles.entries()) {
    if (
      !safe(file.source) || !safe(file.target) || targets.has(file.target) ||
      file.source.split("/").some((p) =>
        privateNames.has(p) || p === "tests"
      ) ||
      (file.audience === "student"
        ? !file.target.startsWith("student/") ||
          file.target.split("/").some((p) => privateNames.has(p))
        : file.target.startsWith("student/")) ||
      (!["student", "reference", "tests"].includes(file.target.split("/")[0]) &&
        !["rubric.md", "contract.md"].includes(file.target))
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Недопустимый common source/target/audience или повторный target",
        path: ["commonFiles", i],
      });
    }
    targets.add(file.target);
  }
});
const materializationEntryInput = (source?: string) =>
  z.strictObject({
    "common-files": z.array(
      NativeProjectMaterializationSchema.shape.commonFiles.element.extend({
        source: z.string().min(1),
      }),
    ),
    "include-git": NativeProjectMaterializationSchema.shape.includeGit,
  }).transform((value) => ({
    commonFiles: value["common-files"].map((file) => ({
      ...file,
      source: source === undefined ? file.source : posix.normalize(
        file.source.startsWith("/")
          ? file.source.slice(1)
          : posix.join(posix.dirname(source), file.source),
      ),
    })),
    ...(value["include-git"] !== undefined
      ? { includeGit: value["include-git"] }
      : {}),
  })).pipe(NativeProjectMaterializationSchema);
/** Native metadata: /path — от owner, остальные пути — от QMD; затем строгий canon. */
export const nativeProjectMaterializationInputSchema = (source?: string) =>
  z.strictObject({
    projects: z.record(
      z.string().regex(/^exr-[a-z0-9][a-z0-9-]*$/),
      materializationEntryInput(source),
    ),
  });
export const NativeProjectMaterializationInputSchema =
  nativeProjectMaterializationInputSchema();
export const NativeProjectFactSchema = z.strictObject({
  exerciseId: z.string().regex(/^exr-/),
  source: z.string().min(1),
  projectRoot: z.string().min(1),
  bankMember: z.boolean(),
  purpose: z.enum([
    "demonstration",
    "discussion",
    "independent-study",
    "control",
  ]).optional(),
  statementVisibility: z.enum(["open", "restricted"]),
  artifactPolicy: z.strictObject({
    student: z.enum(["starter", "full"]).optional(),
    full: z.literal("full"),
    conditions: z.boolean(),
  }),
  projectCheck: z.string().regex(/^[a-z][a-z0-9-]*$/).optional(),
  // Только старое inert DATA; actual Core producer не выдаёт normalized check.
  // C обязан проверить parity со своим каноном до использования и вычисления hashes.
  check: z.unknown().optional(),
  materialization: NativeProjectMaterializationSchema.optional(),
});
export type NativeProjectFact = z.output<typeof NativeProjectFactSchema>;
export const NativeProjectFactsCaptureSchema = z.strictObject({
  schema: z.literal("course-native-project-facts-v1"),
  context: DocumentContextSchema.extend({ captureWitness: z.uuid() }),
  source: z.string().min(1),
  projects: z.array(NativeProjectFactSchema).max(4096),
  projectMaterializations: z.record(
    z.string(),
    NativeProjectMaterializationSchema,
  ),
  collectCalls: z.literal(1),
});
