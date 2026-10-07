import { diagnostic } from "../domain/diagnostics.ts";
import { dirname, fromFileUrl, join } from "stdlib/path";
import type { Adapter, ReleaseResult } from "../domain/model.ts";
import { checkPaths } from "./files.ts";
import { command } from "./process.ts";
export async function validateRelease(
  result: ReleaseResult,
  projectRoot: string,
  adapters: Adapter[] = [],
  sourceRoots?: Record<string, string>,
) {
  if (sourceRoots) {
    for (
      const item of [...result.model.exercises, ...result.model.assessments]
    ) {
      if (!sourceRoots[item.source]) {
        throw diagnostic("CORE.SOURCE_ROOT_MISSING", "Не найден корень входного документа: " + item.source, {source: item.source, id: item.id, field: "sourceRoots"});
      }
    }
    for (const root of new Set(Object.values(sourceRoots))) {
      await checkPaths(root, {
        ...result.model,
        exercises: result.model.exercises.filter((x) =>
          sourceRoots[x.source] === root
        ),
        assessments: result.model.assessments.filter((x) =>
          sourceRoots[x.source] === root
        ),
      });
    }
  } else await checkPaths(projectRoot, result.model);
  // CUE resolves inputs relative to projectRoot, including Windows volumes.
  const file = await Deno.makeTempFile({ dir: projectRoot, prefix: ".course-validation-", suffix: ".json" });
  try {
    await Deno.writeTextFile(file, JSON.stringify(result.model));
    await command(Deno.env.get("CUE") || "cue", [
      "vet",
      join(dirname(dirname(fromFileUrl(import.meta.url))), "spec/core.cue"),
      ...adapters.map((a) => join(a.directory, a.contract.rules)),
      file,
      "-d",
      "#Course",
      "-c",
      "--all-errors",
    ], projectRoot);
  } finally {
    await Deno.remove(file);
  }
}
