// Связь уже декодированных SAME-S project facts; собственного metadata resolver нет.
import type { NativeProjectFact } from "../document/project-facts.ts";
import {
  NativeProjectFactsCaptureSchema,
  NativeProjectMaterializationSchema,
} from "../document/project-facts.ts";
import { decode } from "../document/contracts.ts";
// @deno-types="../vendor/zod/v4/index.d.ts"
import { z } from "../vendor/zod/v4/index.js";
type ProjectMaterialization = z.output<
  typeof NativeProjectMaterializationSchema
>;
type Captured = Pick<
  z.output<typeof NativeProjectFactsCaptureSchema>,
  "source" | "projects" | "projectMaterializations"
>;
import { diagnostic } from "./diagnostics.ts";
const fail = (message: string): never => {
  throw diagnostic("CORE.PROJECT_MATERIALIZATION_INVALID", message);
};
const stable = (value: unknown): string =>
  JSON.stringify(
    value,
    (_key, item) =>
      item && typeof item === "object" && !Array.isArray(item)
        ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
        : item,
  );
function declaration(input: ProjectMaterialization): ProjectMaterialization {
  const value = decode(
    NativeProjectMaterializationSchema,
    input,
    "CORE.PROJECT_MATERIALIZATION_INVALID",
  );
  return { ...value, includeGit: value.includeGit ?? false };
}
function bind(documents: Captured[]): NativeProjectFact[] {
  const declarations = new Map<string, ProjectMaterialization>(),
    facts: NativeProjectFact[] = [];
  for (const document of documents) {
    for (const fact of document.projects ?? []) {
      if (
        fact.source !== document.source ||
        facts.some((f) => f.exerciseId === fact.exerciseId)
      ) fail("Неоднозначная captured project/source: " + fact.exerciseId);
      facts.push({
        ...fact,
        ...(fact.materialization
          ? { materialization: declaration(fact.materialization) }
          : {}),
      });
    }
    for (
      const [id, raw] of Object.entries(document.projectMaterializations ?? {})
    ) {
      if (!/^exr-[a-z0-9][a-z0-9-]*$/.test(id)) {
        fail("Некорректный materialization ID");
      }
      const value = declaration(raw);
      if (
        declarations.has(id) && stable(declarations.get(id)) !== stable(value)
      ) fail("Несогласованные materialization declarations: " + id);
      declarations.set(id, value);
    }
  }
  for (const [id, value] of declarations) {
    const matches = facts.filter((f) => f.exerciseId === id);
    if (matches.length !== 1) {
      fail("Materialization требует ровно один действующий project: " + id);
    }
    const fact = matches[0];
    if (
      fact.materialization && stable(fact.materialization) !== stable(value)
    ) fail("Project fact расходится с captured declaration: " + id);
    fact.materialization = value;
  }
  return facts;
}
/** Полная область: неизвестные объявления и смешанные owner bindings отвергаются. */
export function bindProjectMaterializations(
  documents: Captured[],
): NativeProjectFact[] {
  return bind(documents);
}
