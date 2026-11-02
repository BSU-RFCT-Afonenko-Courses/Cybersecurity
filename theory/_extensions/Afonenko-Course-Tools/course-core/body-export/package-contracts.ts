// Единственный исполняемый договор экспортного пакета; типы выводятся из схемы.
// @deno-types="../vendor/zod/v4/index.d.ts"
import { z } from "../vendor/zod/v4/index.js";
import { AssignmentSchema } from "../release/contracts.ts";
const owner = z.string().regex(/^[a-z][a-z0-9-]*$/);
const exercise = z.string().regex(/^exr-[a-z0-9][a-z0-9-]*$/);
const qualifiedExercise = z.string().regex(/^[a-z][a-z0-9-]*\/exr-[a-z0-9][a-z0-9-]*$/);
const unique = (items: string[]) => new Set(items).size === items.length;
// Тело — native Pandoc payload: этот договор не становится вторым AST-парсером.
const body = z.array(z.any());
export const BodyQuestionSchema = z.strictObject({
  owner: z.string(), id: exercise, key: z.string(), source: z.string().min(1),
  title: z.string().min(1).optional(),
  difficulty: z.enum(["introductory", "intermediate", "advanced"]).optional(),
  time: z.number().positive().optional(), visibility: z.literal("public"),
  statementVisibility: z.enum(["open", "restricted"]),
  purpose: z.enum(["demonstration", "discussion", "independent-study", "control"]).optional(),
  hasPublicSolution: z.boolean(), condition: body, publicAnswer: body,
  answerType: z.enum(["manual", "single-choice", "numeric", "multipart", "matching"]),
  closedKey: z.unknown().refine((value) => value !== undefined, "Требуется closedKey"), solution: body, gradingNotes: body,
}).refine((q) => q.key === q.owner + "/" + q.id, "Некорректный question key");
const slot = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*\/(exr|alt)-[a-z0-9][a-z0-9-]*$/),
  selection: z.enum(["fixed", "random", "choice"]),
  candidates: z.array(qualifiedExercise).refine(unique, "Повторный кандидат"),
  assignment: AssignmentSchema,
}).superRefine((s, c) => {
  if ((s.selection === "fixed" && s.candidates.length !== 1) ||
      (s.selection !== "fixed" && s.candidates.length < 2)) {
    c.addIssue({code: "custom", message: "Некорректная cardinality позиции"});
  }
  if (s.selection === "choice" && s.assignment.requirement !== "required") {
    c.addIssue({code: "custom", message: "choice требует required"});
  }
});
const work = z.strictObject({
  owner: z.string(), id: owner, key: z.string(), source: z.string().min(1),
  kind: z.enum(["lab", "seminar", "practical", "test"]), title: z.string().min(1),
  introduction: body.optional(), slots: z.array(slot).min(1),
  relatedExercise: exercise.optional(), theoryTime: z.number().positive().optional(),
}).superRefine((w, c) => {
  if (w.key !== w.owner + "/" + w.id || !unique(w.slots.map((s) => s.id)) ||
      !unique(w.slots.flatMap((s) => s.candidates))) {
    c.addIssue({code: "custom", message: "Некорректный work key или повторная позиция/кандидат"});
  }
});
export const BodyPackageSchema = z.strictObject({
  schema: z.literal("course-body-package-v2"), owner, release: z.string().min(1),
  apiVersion: z.array(z.number().int().nonnegative()).min(1),
  questions: z.array(BodyQuestionSchema).min(1), works: z.array(work).min(1),
  resources: z.array(z.any()),
}).superRefine((p, c) => {
  const issue = (message: string, path: (string | number)[] = []) => c.addIssue({code: "custom", message, path});
  const questions = new Map(p.questions.map((q) => [q.key, q]));
  if (questions.size !== p.questions.length || !unique(p.works.map((w) => w.key))) issue("Повторный question/work key");
  const used = new Set<string>();
  for (const [i, q] of p.questions.entries()) if (q.owner !== p.owner) issue("Чужой question owner", ["questions", i, "owner"]);
  for (const [i, w] of p.works.entries()) {
    if (w.owner !== p.owner) issue("Чужой work owner", ["works", i, "owner"]);
    for (const [j, s] of w.slots.entries()) {
      const prefix = w.key + "/";
      if (s.selection === "fixed" ? s.id !== prefix + s.candidates[0]?.slice(p.owner.length + 1)
          : !s.id.startsWith(prefix + "alt-")) {
        issue("Позиция не принадлежит работе/кандидату", ["works", i, "slots", j, "id"]);
      }
      for (const key of s.candidates) {
        const q = questions.get(key); used.add(key);
        if (!q) { issue("Неизвестный кандидат", ["works", i, "slots", j, "candidates"]); continue; }
        if ((w.kind === "test" || w.kind === "practical") && q.statementVisibility !== "restricted") issue("Для test/practical требуется restricted", ["works", i, "slots", j]);
        if (s.assignment.stage === "demonstration" &&
            (q.statementVisibility !== "open" || q.purpose !== "demonstration" || !q.hasPublicSolution)) issue("Демонстрация требует открытого условия, purpose и публичного решения", ["works", i, "slots", j]);
      }
    }
  }
  for (const [i, q] of p.questions.entries()) if (!used.has(q.key)) issue("Неиспользованный вопрос", ["questions", i]);
});
export type BodyQuestion = z.output<typeof BodyQuestionSchema>;
export type BodyPackage = z.output<typeof BodyPackageSchema>;
