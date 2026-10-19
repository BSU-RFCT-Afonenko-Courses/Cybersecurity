// Самодостаточный фасад ABI 1. Копировать только из канонического шаблона Performance.
export interface OperationSpec {
  id: string;
  kind: "phase" | "function" | "ast_walk" | "io" | "command";
  symbol_id?: string;
  origin?: "manual" | "auto" | "runtime";
}
export interface WalkSpec extends OperationSpec {
  kind: "ast_walk";
  scope: "full-document" | "fragment" | "block" | "inline" | "unknown";
}
// deno-lint-ignore no-explicit-any
type Fn = (...args: any[]) => any;
export interface Metrics {
  wrapSync<T extends Fn>(spec: OperationSpec, fn: T): T;
  wrapAsync<T extends Fn>(spec: OperationSpec, fn: T): T;
  wrapWalk<T extends Fn>(spec: WalkSpec, fn: T): T;
  childEnv(base: Record<string, string>): Record<string, string>;
}
const identity: Metrics = {
  wrapSync: (_spec, fn) => fn,
  wrapAsync: (_spec, fn) => fn,
  wrapWalk: (_spec, fn) => fn,
  childEnv: (base) => base,
};
export function createMetrics(extensionId: string, abiVersion: 1 = 1): Metrics {
  let mode: string | undefined;
  try {
    mode = Deno.env.get("COURSE_PERF_MODE");
  } catch {
    return identity;
  }
  if (!mode || mode === "off") return identity;
  const registry = globalThis as unknown as Record<symbol, unknown>;
  const agent = registry[Symbol.for("course.performance.agent.v1")] as {
    abiVersion: number;
    metrics: Metrics;
  } | undefined;
  if (agent?.abiVersion === abiVersion && agent.metrics) return agent.metrics;
  const failures = Symbol.for("course.performance.failures.v1");
  ((registry[failures] ??= []) as string[]).push(
    `${extensionId}: агент ABI ${abiVersion} отсутствует или несовместим`,
  );
  return identity;
}
