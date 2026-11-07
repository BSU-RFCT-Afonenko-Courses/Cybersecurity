import {
  assertProjectContext,
  decodeProjectContract,
} from "../infrastructure/project-context.ts";
import type {
  ProjectContext,
  ProjectContextView,
  ProjectContractContext,
} from "../contracts/project.ts";
import { fail } from "../contracts/project.ts";
import { decode } from "../document/contracts.ts";
import { immutable } from "../document/condition.ts";
import {
  ProjectPlanMetricsSchema,
  ProjectPlanSchema,
  ProjectSelectionSchema,
} from "./contracts.ts";
import type {
  ArtifactInventory,
  ProjectPlan,
  ProjectSelection,
} from "./contracts.ts";
export type PlanState = {
  context: ProjectContextView;
  files: { path: string; target: string; reason: string }[];
  trees: { path: string; prefix: string; reason: string }[];
  gradle?: string;
  fragments: Map<string, unknown[]>;
  local?: string;
  cache: Map<string, ArtifactInventory>;
  metrics: {
    treeWalks: number;
    fileReads: number;
    hashReads: number;
    pandocCalls: number;
    cacheHits: number;
  };
};
const plans = new WeakMap<object, PlanState>();
export async function projectPlanState(plan: ProjectPlan) {
  const state = plans.get(plan);
  if (!state) fail("CONTEXT_EXPIRED", "Чужой план проекта");
  await assertProjectContext(state.context);
  return state;
}
/** Closure names share one namespace; explicit false is never re-enabled by requires. */
export function planProject(
  context: ProjectContext,
  selection: ProjectSelection,
): Promise<ProjectPlan>;
export function planProject(
  context: ProjectContractContext,
  selection: ProjectSelection,
): Promise<ProjectPlan>;
export function planProject(
  context: ProjectContextView,
  selection: ProjectSelection,
): Promise<ProjectPlan>;
export async function planProject(
  context: ProjectContextView,
  selection: ProjectSelection,
): Promise<ProjectPlan> {
  await assertProjectContext(context);
  const choice = decode(
    ProjectSelectionSchema,
    selection,
    "PROJECT_SELECTION",
  );
  const project = decodeProjectContract(context);
  if (!project.starter) {
    fail(
      "PROJECT_INCOMPLETE",
      "Нужен объявленный starter",
      context.input,
    );
  }
  if (
    project.instructions?.gradle ||
    Object.keys(project.build.files).some((p) =>
      /^(build|settings)\.gradle(?:\.kts)?$/.test(p)
    )
  ) {
    if (!project.instructions?.gradle) {
      fail(
        "PROJECT_INCOMPLETE",
        "Нужна общая Gradle-инструкция",
        context.input,
      );
    }
    for (const required of ["build.gradle", "settings.gradle"]) {
      if (
        !project.build.files[required] &&
        !project.build.files[required + ".kts"]
      ) fail("PROJECT_INCOMPLETE", "Нет настоящего " + required, context.input);
    }
  }
  const nodes = { ...project.components, ...project.testsets };
  if (
    Object.keys(project.components).some((n) =>
      Object.hasOwn(project.testsets, n)
    )
  ) {
    fail(
      "PROJECT_AMBIGUOUS",
      "Component/testset используют одно имя",
      context.input,
    );
  }
  const graphActive = new Set<string>(), graphDone = new Set<string>();
  const validateGraph = (name: string, chain: string[]) => {
    if (!Object.hasOwn(nodes, name)) {
      fail("PROJECT_UNKNOWN", [...chain, name].join(" → "), context.input);
    }
    if (graphActive.has(name)) {
      fail("PROJECT_CYCLE", [...chain, name].join(" → "), context.input);
    }
    if (graphDone.has(name)) return;
    graphActive.add(name);
    for (const [dep, on] of Object.entries(nodes[name].requires)) {
      if (!Object.hasOwn(nodes, dep)) {
        fail(
          "PROJECT_UNKNOWN",
          [...chain, name, dep].join(" → "),
          context.input,
        );
      }
      if (on) validateGraph(dep, [...chain, name]);
    }
    graphActive.delete(name);
    graphDone.add(name);
  };
  for (const name of Object.keys(nodes)) validateGraph(name, []);
  for (const name of Object.keys(project.starter.requires)) {
    if (!Object.hasOwn(nodes, name)) {
      fail("PROJECT_UNKNOWN", "starter → " + name, context.input);
    }
  }
  const roots = choice.audience === "student"
    ? project.delivery.student.testsets
    : project.verification.testsets;
  const selected = new Set<string>(),
    done = new Set<string>(),
    active = new Set<string>(),
    forbidden = new Map<string, string>();
  for (const [n, on] of Object.entries(roots)) {
    if (!Object.hasOwn(project.testsets, n)) {
      fail("PROJECT_UNKNOWN", "Неизвестный testset " + n, context.input);
    }
    if (!on) forbidden.set(n, "selection → " + n + "=false");
  }
  const visit = (name: string, chain: string[]) => {
    const trace = [...chain, name];
    if (!Object.hasOwn(nodes, name)) {
      fail("PROJECT_UNKNOWN", trace.join(" → "), context.input);
    }
    if (forbidden.has(name)) {
      fail(
        "PROJECT_CONFLICT",
        trace.join(" → ") + "; запрещено: " + forbidden.get(name),
        context.input,
      );
    }
    if (active.has(name)) {
      fail("PROJECT_CYCLE", trace.join(" → "), context.input);
    }
    selected.add(name);
    if (done.has(name)) return;
    active.add(name);
    for (const [dep, on] of Object.entries(nodes[name].requires)) {
      if (!Object.hasOwn(nodes, dep)) {
        fail("PROJECT_UNKNOWN", [...trace, dep].join(" → "), context.input);
      }
      if (!on) {
        forbidden.set(dep, [...trace, dep + "=false"].join(" → "));
        if (selected.has(dep)) {
          fail(
            "PROJECT_CONFLICT",
            [...trace, dep + "=false"].join(" → "),
            context.input,
          );
        }
      }
    }
    for (const [dep, on] of Object.entries(nodes[name].requires)) {
      if (on) visit(dep, trace);
    }
    active.delete(name);
    done.add(name);
  };
  for (const [n, on] of Object.entries(project.starter.requires)) {
    if (!on) forbidden.set(n, "starter → " + n + "=false");
  }
  for (const [n, on] of Object.entries(project.starter.requires)) {
    if (on) visit(n, ["starter"]);
  }
  for (const [n, on] of Object.entries(roots)) if (on) visit(n, ["selection"]);
  const source = (field: string) => {
    const origin = context.origins[field];
    if (!origin?.resolvedPath) {
      fail(
        "ORIGIN_UNPROVEN",
        "Нет доказанного path origin",
        context.input,
        field,
      );
    }
    return origin.resolvedPath;
  };
  const groups = choice.audience === "full"
    ? Object.keys(project.solutions).sort()
    : [];
  const trees: PlanState["trees"] = [{
    path: source("starter.path"),
    prefix: "",
    reason: "starter",
  }];
  const files = Object.keys(project.build.files).sort().map((target) => ({
    path: source("build.files." + target),
    target,
    reason: "build",
  }));
  for (const name of [...selected].sort()) {
    trees.push({
      path: source(
        (Object.hasOwn(project.testsets, name) ? "testsets." : "components.") +
          name + ".path",
      ),
      prefix: "",
      reason:
        (Object.hasOwn(project.testsets, name) ? "testset:" : "component:") +
        name,
    });
  }
  // Reference/alternative source groups are independent roots with the same actual build/tests.
  for (const group of groups) {
    trees.push({
      path: source("solutions." + group + ".path"),
      prefix: "author/" + group + "/",
      reason: "solution:" + group,
    });
    for (
      const tree of trees.filter((t) => !t.prefix && t.reason !== "starter")
    ) trees.push({ ...tree, prefix: "author/" + group + "/" });
    for (
      const file of [...files].filter((f) => !f.target.startsWith("author/"))
    ) files.push({ ...file, target: "author/" + group + "/" + file.target });
  }
  const plan = immutable(decode(ProjectPlanSchema, {
    id: crypto.randomUUID(),
    input: context.input,
    audience: choice.audience,
    testsets: [...selected].filter((n) => Object.hasOwn(project.testsets, n))
      .sort(),
    components: [...selected].filter((n) =>
      Object.hasOwn(project.components, n)
    ).sort(),
    groups,
  }, "PROJECT_PLAN"));
  plans.set(plan, {
    context,
    files,
    trees,
    ...(project.instructions?.gradle
      ? { gradle: source("instructions.gradle.path") }
      : {}),
    fragments: new Map(),
    ...(project.instructions?.local
      ? { local: source("instructions.local.path") }
      : {}),
    cache: new Map(),
    metrics: {
      treeWalks: 0,
      fileReads: 0,
      hashReads: 0,
      pandocCalls: 0,
      cacheHits: 0,
    },
  });
  return plan;
}
export function projectPlanMetrics(plan: ProjectPlan) {
  const state = plans.get(plan);
  if (!state) fail("CONTEXT_EXPIRED", "Чужой план");
  return Object.freeze(ProjectPlanMetricsSchema.parse({ ...state.metrics }));
}
