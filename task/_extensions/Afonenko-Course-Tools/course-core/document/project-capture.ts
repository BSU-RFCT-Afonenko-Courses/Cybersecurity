import { relative } from "stdlib/path";
import { fail } from "../contracts/project.ts";
import { decode } from "./contracts.ts";
import type { EarlyDocument } from "./contracts.ts";
import {
  NativeProjectFactsCaptureSchema,
  NativeProjectMaterializationInputSchema,
} from "./project-facts.ts";
/** Pure data projection того же preprojection EarlyDocument; нет resolver/IO/PL normalization. */
export function collectNativeProjectFacts(early: EarlyDocument, root: string) {
  const source = relative(root, early.context.input).replaceAll("\\", "/");
  if (
    !source || source.startsWith("/") ||
    source.split("/").some((p) => !p || p === "." || p === "..")
  ) fail("BODY.PROJECT_FACTS_UNQUALIFIED", "Чужой native project owner");
  if (!early.release) {
    fail("BODY.PROJECT_FACTS_UNQUALIFIED", "Нет raw release facts");
  }
  const raw = early.release.nativeMetadata.projectMaterialization;
  const materializations = raw === undefined ? {} : decode(
    NativeProjectMaterializationInputSchema,
    raw,
    "CORE.PROJECT_MATERIALIZATION_INVALID",
    source,
  ).projects;
  const projects = early.release.declarations.filter((d) => d.project).map(
    (d) => {
      const definition = early.definitions[d.id];
      if (
        !definition || !d.project!.startsWith("/") ||
        d.project!.startsWith("//")
      ) {
        fail(
          "BODY.PROJECT_FACTS_UNQUALIFIED",
          "Нужен declared owner-relative project",
          source,
          d.id,
        );
      }
      const projectRoot = d.project!.slice(1);
      if (
        !projectRoot || /[\\\0:]/.test(projectRoot) ||
        projectRoot.split("/").some((p) => !p || p === "." || p === "..")
      ) {
        fail(
          "BODY.PROJECT_FACTS_UNQUALIFIED",
          "Небезопасный project path",
          source,
          d.id,
        );
      }
      const statement = definition["statement-visibility"],
        purpose = definition["course-role"],
        open = statement === "open";
      return {
        exerciseId: d.id,
        source,
        projectRoot,
        bankMember: early.context.exerciseBank,
        ...(purpose ? { purpose } : {}),
        statementVisibility: statement,
        artifactPolicy: {
          ...(open
            ? {
              student: purpose === "demonstration"
                ? "full" as const
                : "starter" as const,
            }
            : {}),
          full: "full" as const,
          conditions: open,
        },
        ...(d.check ? { projectCheck: d.check } : {}),
        ...(materializations[d.id]
          ? { materialization: materializations[d.id] }
          : {}),
      };
    },
  ).sort((a, b) => a.exerciseId.localeCompare(b.exerciseId));
  return decode(
    NativeProjectFactsCaptureSchema,
    {
      schema: "course-native-project-facts-v1",
      context: early.context,
      source,
      projects,
      projectMaterializations: materializations,
      collectCalls: 1,
    },
    "BODY.PROJECT_FACTS_UNQUALIFIED",
    source,
  );
}
