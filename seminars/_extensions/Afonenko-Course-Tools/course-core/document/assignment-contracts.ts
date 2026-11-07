// @deno-types="../vendor/zod/v4/index.d.ts"
import { z } from "../vendor/zod/v4/index.js";
export const NativeResponseSlotSchema = z.strictObject({
  name: z.string().min(1),
  type: z.enum(["manual", "numeric", "single-choice", "matching"]),
  anchor: z.string().min(1),
  labelAnchor: z.string().min(1).optional(),
  ordinal: z.number().int().nonnegative().optional(),
  options: z.array(
    z.strictObject({
      anchor: z.string().min(1),
      ordinal: z.number().int().nonnegative(),
    }),
  ).optional(),
});
export type NativeResponseSlot = z.output<typeof NativeResponseSlotSchema>;
export const AssignmentEarlySchema = z.strictObject({
  source: z.string().min(1),
  producerProfile: z.string().min(1),
  assessments: z.array(
    z.strictObject({ source: z.string().min(1), id: z.string().min(1) }),
  ),
  introductions: z.array(
    z.strictObject({ key: z.string().min(1), id: z.string().min(1) }),
  ),
  answers: z.record(
    z.string(),
    z.strictObject({
      type: z.enum([
        "manual",
        "numeric",
        "single-choice",
        "multipart",
        "matching",
      ]),
      declared: z.boolean(),
      key: z.string().min(1),
      anchors: z.array(z.string()),
      responseSlots: z.array(NativeResponseSlotSchema),
    }),
  ),
  citationMetadata: z.record(z.string(), z.unknown()),
});
export const AssignmentLateSchema = z.strictObject({
  introductions: z.array(
    z.strictObject({
      key: z.string(),
      id: z.string(),
      body: z.array(z.unknown()),
    }),
  ),
});
export const AssignmentFinalSchema = AssignmentEarlySchema.omit({
  introductions: true,
  answers: true,
}).extend({
  introductions: z.record(z.string(), z.array(z.unknown())),
  answers: z.record(
    z.string(),
    z.strictObject({
      type: z.enum([
        "manual",
        "numeric",
        "single-choice",
        "multipart",
        "matching",
      ]),
      declared: z.boolean(),
      publicAnswer: z.array(z.unknown()),
      responseSlots: z.array(NativeResponseSlotSchema),
    }),
  ),
});
export type AssignmentEarly = z.output<typeof AssignmentEarlySchema>;
export type AssignmentNormalization = {
  source: string;
  producerProfile: string;
  assessments: readonly { source: string; id: string }[];
};
