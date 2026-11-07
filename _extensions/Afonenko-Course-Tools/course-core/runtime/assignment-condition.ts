import { fail } from "../contracts/project.ts";
import type {
  NativeAssignmentCondition,
  ProjectPlan,
} from "../artifacts/contracts.ts";
const conditions = new WeakMap<
  object,
  { plans: ReadonlySet<ProjectPlan>; assertPath: (path: string) => void }
>();
export function bindAssignmentCondition(
  value: NativeAssignmentCondition,
  plans: readonly ProjectPlan[],
  assertPath: (path: string) => void,
) {
  conditions.set(value, { plans: new Set(plans), assertPath });
}
export function assertAssignmentConditionPlan(
  value: object,
  plan: ProjectPlan,
) {
  const state = conditions.get(value);
  if (!state || !state.plans.has(plan)) {
    fail(
      "CONDITION_AUTHORITY",
      "Assignment condition не принадлежит этому exact student/full plan pair",
    );
  }
}
export function assertAssignmentArtifactSource(value: object, path: string) {
  const state = conditions.get(value);
  if (state) state.assertPath(path);
  else if ((value as { kind?: unknown }).kind === "assignment") {
    fail("CONDITION_AUTHORITY", "Нет exact assignment condition capability");
  }
}
