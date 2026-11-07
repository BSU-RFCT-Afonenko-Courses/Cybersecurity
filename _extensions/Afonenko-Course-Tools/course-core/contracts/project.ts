// @deno-types="../vendor/zod/v4/index.d.ts"
import { z } from "../vendor/zod/v4/index.js";

export class CoreContractError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly source?: string,
    readonly field?: string,
  ) {
    super(
      `${code}: ${source ? source + ": " : ""}${
        field ? field + ": " : ""
      }${message}`,
    );
    this.name = "CoreContractError";
  }
}
export function fail(
  code: string,
  message: string,
  source?: string,
  field?: string,
): never {
  throw new CoreContractError(code, message, source, field);
}
/** Ограничение до схем: Zod не накапливает тысячи ошибок для чужого payload. */
export function boundInput(value: unknown, source?: string): void {
  let count = 0;
  const active = new Set<object>();
  function visit(v: unknown, depth: number) {
    if (++count > 4096 || depth > 32) {
      fail("CONTRACT_LIMIT", "Превышен размер или глубина договора", source);
    }
    if (typeof v === "string" && v.length > 65536) {
      fail("CONTRACT_LIMIT", "Слишком длинная строка", source);
    }
    if (v && typeof v === "object") {
      if (active.has(v)) fail("CONTRACT_LIMIT", "Циклический вход", source);
      active.add(v);
      for (const [k, child] of Object.entries(v)) {
        if (
          k.length > 256 ||
          ["__proto__", "constructor", "prototype"].includes(k)
        ) fail("CONTRACT_KEY", "Недопустимое имя поля", source);
        visit(child, depth + 1);
      }
      active.delete(v);
    }
  }
  visit(value, 0);
}
const name = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/).max(80);
const sourcePath = z.string().min(1).max(1024).refine(
  (v) => !/[\0\\]/.test(v) && !v.startsWith("/"),
  "Нужен относительный путь",
);
const target = sourcePath.refine(
  (v) => !v.split("/").some((p) => !p || p === "." || p === ".."),
  "Нужен нормализованный target",
);
const boolMap = z.record(name, z.boolean());
const dependencies = z.record(name, z.boolean());
const component = z.strictObject({
  path: sourcePath,
  requires: dependencies.default({}),
});
const testset = z.strictObject({
  path: sourcePath,
  requires: dependencies.default({}),
});
export const ProjectContractSchema = z.strictObject({
  starter: component.optional(),
  instructions: z.strictObject({
    gradle: z.strictObject({ path: sourcePath }).optional(),
    local: z.strictObject({ path: sourcePath }).optional(),
  }).optional(),
  solutions: z.record(name, z.strictObject({ path: sourcePath })).default({}),
  components: z.record(name, component).default({}),
  testsets: z.record(name, testset).default({}),
  build: z.strictObject({ files: z.record(target, sourcePath).default({}) })
    .default({ files: {} }),
  delivery: z.strictObject({
    student: z.strictObject({ testsets: boolMap.default({}) }).default({
      testsets: {},
    }),
  }).default({ student: { testsets: {} } }),
  verification: z.strictObject({ testsets: boolMap.default({}) }).default({
    testsets: {},
  }),
});
export type ProjectContract = z.output<typeof ProjectContractSchema>;
export type ProjectContractInput = z.input<typeof ProjectContractSchema>;
export function decodeProjectValue(
  value: unknown,
  source?: string,
): ProjectContract {
  boundInput(value, source);
  const result = ProjectContractSchema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    fail("PROJECT_CONTRACT", issue.message, source, issue.path.join("."));
  }
  return result.data;
}

export const ProjectContextRequestSchema = z.strictObject({
  owner: z.string().min(1).max(4096),
  inputs: z.array(z.string().min(1).max(4096)).min(1),
  profiles: z.array(z.string().regex(/^[-a-z0-9]+$/)).max(16),
  format: z.string().regex(/^[-a-z0-9]+$/),
});
export type ProjectContextRequest = z.output<
  typeof ProjectContextRequestSchema
>;
export const NativeOriginSchema = z.strictObject({
  raw: z.unknown(),
  effective: z.unknown(),
  sourceFile: z.string().min(1),
  range: z.tuple([
    z.number().int().nonnegative(),
    z.number().int().nonnegative(),
  ]).optional(),
  baseKind: z.enum(["definition", "project"]),
  resolvedPath: z.string().min(1).optional(),
  evidence: z.literal("native-scalar-marker"),
});
export type NativeOrigin = z.output<typeof NativeOriginSchema>;
export const ProjectContextSchema = z.strictObject({
  owner: z.string().min(1),
  input: z.string().min(1),
  profiles: z.array(z.string()),
  format: z.string().min(1),
  effectiveMetadata: z.record(z.string(), z.unknown()),
  origins: z.record(z.string(), NativeOriginSchema),
});
export type ProjectContext = Readonly<z.output<typeof ProjectContextSchema>>;
/** Узкий namespace handle; authority существует только в private lifetime binding. */
export const ProjectContractContextSchema = ProjectContextSchema.omit({
  effectiveMetadata: true,
}).extend({ contract: ProjectContractSchema });
export type ProjectContractContext = Readonly<
  z.output<typeof ProjectContractContextSchema>
>;
export type ProjectContextView = ProjectContext | ProjectContractContext;
export function decodeProjectRequests(value: unknown): ProjectContextRequest[] {
  boundInput(value);
  const result = z.array(ProjectContextRequestSchema).min(1).safeParse(
    value,
  );
  if (!result.success) {
    const issue = result.error.issues[0];
    fail("CONTEXT_REQUEST", issue.message, undefined, issue.path.join("."));
  }
  return result.data;
}
