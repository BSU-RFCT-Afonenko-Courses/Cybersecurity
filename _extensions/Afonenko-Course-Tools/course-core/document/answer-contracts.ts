// @deno-types="../vendor/zod/v4/index.d.ts"
import { z } from "../vendor/zod/v4/index.js";
// Единый исполняемый договор ответа; закрытые факты вне public AST.
const manual = { type: z.literal("manual"), submission: z.literal("text") };
const numeric = {
  type: z.literal("numeric"),
  key: z.strictObject({
    value: z.number().finite(),
    tolerance: z.strictObject({ absolute: z.number().finite().nonnegative() }),
  }),
};
const part = {
  name: z.string().regex(/^[a-z][a-z0-9-]*$/),
  label: z.string().min(1),
};
export const AnswerSpecSchema = z.discriminatedUnion("type", [
  z.strictObject(manual),
  z.strictObject(numeric),
  z.strictObject({
    type: z.literal("multipart"),
    parts: z.array(z.discriminatedUnion("type", [
      z.strictObject({ ...manual, ...part }),
      z.strictObject({ ...numeric, ...part }),
    ])).min(1).max(4096).refine(
      (parts) => new Set(parts.map((p) => p.name)).size === parts.length,
      "Повторное имя части",
    ),
  }),
  z.strictObject({
    type: z.literal("matching"),
    prompts: z.array(z.string().min(1)).min(1).max(4096),
    options: z.array(z.string().min(1)).min(1).max(4096),
    key: z.strictObject({ pairs: z.record(z.string(), z.string()) }),
  }).superRefine((a, c) => {
    if (
      new Set(a.prompts).size !== a.prompts.length ||
      new Set(a.options).size !== a.options.length ||
      Object.keys(a.key.pairs).length !== a.prompts.length ||
      a.prompts.some((p) => !Object.hasOwn(a.key.pairs, p)) ||
      Object.entries(a.key.pairs).some(([p, o]) =>
        !a.prompts.includes(p) || !a.options.includes(o)
      )
    ) {
      c.addIssue({
        code: "custom",
        message: "Требуется полное соответствие уникальных условий и вариантов",
      });
    }
  }),
]);
export const AnswerFactsSchema = z.union([
  AnswerSpecSchema,
  z.strictObject({
    type: z.literal("single-choice"),
    count: z.number().int().min(2).max(4096),
    correct: z.number().int().nonnegative(),
  })
    .refine((a) => a.correct < a.count, "correct вне диапазона"),
]);
export type AnswerSpec = z.output<typeof AnswerSpecSchema>;
export type AnswerFacts = z.output<typeof AnswerFactsSchema>;
