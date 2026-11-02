import { dirname, resolve } from "stdlib/path";
import { fail } from "../contracts/project.ts";
import {
  assertProjectContext,
  assertProjectContextGeneration,
} from "../infrastructure/project-context.ts";
import { projectPlanState } from "../artifacts/plan.ts";
import type { ProjectContextView } from "../contracts/project.ts";
import type { ProjectPlan } from "../artifacts/contracts.ts";
export type NativeAssignmentProjectPlans = {
  source: string;
  exerciseId: string;
  student: ProjectPlan;
  full: ProjectPlan;
};
export type AssignmentProjectDeclaration = {
  source: string;
  id: string;
  project: string;
};
export type AssignmentRole = {
  path: string;
  tree: boolean;
  public: boolean;
  reason: string;
};
const inside = (root: string, path: string) =>
  path === root || path.startsWith(root + "/");
function invalid(s: string): never {
  return fail("BODY.ASSIGNMENT_PROJECT_PLANS", s);
}
export function assignmentProjectRoot(
  root: string,
  definition: AssignmentProjectDeclaration,
) {
  const source = resolve(root, definition.source);
  return resolve(
    definition.project.startsWith("/") ? root : dirname(source),
    definition.project.replace(/^\//, ""),
  );
}
/** Pure role intersection; physical origins have already been proven by live A1 contexts. */
export function assignmentRolePredicate(
  roles: readonly AssignmentRole[],
  projectRoots: readonly string[],
  sourceFiles: readonly { path: string; identity: string }[] = [],
) {
  const ordered = [...roles].sort((a, b) => a.path.localeCompare(b.path)),
    stack: AssignmentRole[] = [];
  for (const row of ordered) {
    while (stack.length && !inside(stack.at(-1)!.path, row.path)) stack.pop();
    for (const ancestor of stack) {
      if (
        ancestor.public !== row.public &&
        (ancestor.tree || ancestor.path === row.path)
      ) {
        invalid(
          "Конфликт публичного и закрытого origin: " + ancestor.path + " / " +
            row.path,
        );
      }
    }
    stack.push(row);
  }
  const lexicalClosed = (path: string) =>
    roles.some((r) =>
      !r.public && (path === r.path || r.tree && inside(r.path, path))
    );
  const identities = new Map(
    sourceFiles.map((row) => [row.path, row.identity]),
  );
  const closedIdentities = new Set(
    sourceFiles.filter((row) => lexicalClosed(row.path)).map((row) =>
      row.identity
    ),
  );
  for (const row of sourceFiles) {
    if (
      closedIdentities.has(row.identity) &&
      roles.some((r) =>
        r.public && (row.path === r.path || r.tree && inside(r.path, row.path))
      )
    ) {
      invalid(
        "Конфликт physical alias публичного и закрытого origin " + row.path,
      );
    }
  }
  return (path: string) => {
    if (identities.has(path) && closedIdentities.has(identities.get(path)!)) {
      fail(
        "BODY.RESOURCE_PRIVATE_ROLE",
        "Physical alias закрытого A1 origin " + path,
      );
    }

    if (
      roles.some((r) =>
        !r.public && (path === r.path || r.tree && inside(r.path, path))
      )
    ) fail("BODY.RESOURCE_PRIVATE_ROLE", "Закрытый declared A1 origin " + path);
    const known = roles.some((r) =>
      r.public && (path === r.path || r.tree && inside(r.path, path))
    );
    if (!known && projectRoots.some((root) => inside(root, path))) {
      fail(
        "BODY.RESOURCE_ROLE_UNPROVEN",
        "Нет публичной роли внутри declared project " + path,
      );
    }
  };
}
/** The exact complete plan set is required before the first Body resource lookup. */
export async function assignmentRoleIndex(
  root: string,
  profiles: readonly string[],
  documents: readonly { source: string; format: string }[],
  declared: readonly AssignmentProjectDeclaration[],
  pairs: readonly NativeAssignmentProjectPlans[],
  sourceRows: readonly { path: string; signature: string }[],
  generation: object,
) {
  if (
    !Array.isArray(pairs) || pairs.length !== declared.length ||
    pairs.length > 4096
  ) invalid("Неполное покрытие declared projects");
  const roles: AssignmentRole[] = [],
    contexts = new Map<ProjectContextView, ProjectPlan>(),
    projectRoots: string[] = [],
    plans = new Map<string, NativeAssignmentProjectPlans>();
  for (const pair of pairs) {
    if (
      !pair ||
      Object.keys(pair).some((k) =>
        !["source", "exerciseId", "student", "full"].includes(k)
      )
    ) invalid("Неверная project plan row");
    const key = pair.source + "\0" + pair.exerciseId,
      definition = declared.find((d) =>
        d.source === pair.source && d.id === pair.exerciseId
      ),
      doc = documents.find((d) => d.source === pair.source);
    if (!definition || !doc || plans.has(key)) {
      invalid("Чужой/повторный project plan");
    }
    const student = await projectPlanState(pair.student),
      full = await projectPlanState(pair.full),
      context = student.context;
    if (
      context !== full.context || pair.student.audience !== "student" ||
      pair.full.audience !== "full" || context.owner !== root ||
      context.format !== doc.format ||
      JSON.stringify(context.profiles) !== JSON.stringify(profiles)
    ) invalid("Student/full context/format/profiles/owner отличаются");
    assertProjectContextGeneration(context, generation);
    const project = assignmentProjectRoot(root, definition);
    if (project !== context.input && project !== dirname(context.input)) {
      invalid("Plan относится к другому declared project");
    }
    plans.set(key, pair);
    contexts.set(context, pair.student);
    projectRoots.push(dirname(context.input));
  }
  for (const [context, selected] of contexts) {
    for (const [field, origin] of Object.entries(context.origins)) {
      if (!origin.resolvedPath) continue;
      const path = origin.resolvedPath;
      if (resolve(path) !== path || !inside(root, path)) {
        invalid("Неканонический physical origin");
      }
      let publicRole: boolean, tree: boolean;
      if (field === "starter.path") {
        publicRole = true;
        tree = true;
      } else if (field.startsWith("solutions.") && field.endsWith(".path")) {
        publicRole = false;
        tree = true;
      } else if (field.startsWith("testsets.") && field.endsWith(".path")) {
        publicRole = selected.testsets.includes(field.slice(9, -5));
        tree = true;
      } else if (field.startsWith("components.") && field.endsWith(".path")) {
        publicRole = selected.components.includes(field.slice(11, -5));
        tree = true;
      } else if (
        field.startsWith("build.files.") ||
        field === "instructions.gradle.path" ||
        field === "instructions.local.path"
      ) {
        publicRole = true;
        tree = false;
      } else invalid("Неизвестная origin role " + field);
      roles.push({ path, tree, public: publicRole, reason: field });
    }
  }
  const assertPath = assignmentRolePredicate(
    roles,
    projectRoots,
    sourceRows.map((row) => ({
      path: resolve(root, row.path),
      identity: JSON.stringify(JSON.parse(row.signature).slice(0, 2)),
    })),
  );
  return {
    plans,
    roles: Object.freeze(roles),
    assertPath,
    async guard() {
      for (const context of contexts.keys()) {
        await assertProjectContext(context);
      }
    },
  };
}
