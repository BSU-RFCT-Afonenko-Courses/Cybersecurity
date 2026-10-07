import { diagnostic } from "../domain/diagnostics.ts";
import { runCli } from "./diagnostics.ts";
import { loadNativeRun } from "../infrastructure/native-run.ts";
import { assembleRelease } from "../domain/release.ts";
import { validateRelease } from "../infrastructure/validate.ts";
export async function main(args = Deno.args) {
  const [root = ".", view] = args;
  if (view !== "student" && view !== "full") {
    throw diagnostic("CORE.ARGUMENTS_INVALID", "Укажите PROJECT и student|full", {field: "arguments"});
  }
  const run = await loadNativeRun(root, { view });
  if (!run.renderAll) throw diagnostic("RELEASE.FULL_NATIVE_RUN_REQUIRED", "Проверка курса требует полной текущей native-сборки", {field: "arguments"});
  const result = assembleRelease(
    run.documents.map((d) => d.source),
    run.documents,
    run.adapters,
    { view, profiles: run.profiles },
  );
  await validateRelease(result, run.projectRoot, run.adapters);
  await Deno.writeTextFile(
    run.projectRoot + "/_generated/course-spec/course.json",
    JSON.stringify(result.model, null, 2),
  );
  console.log(`Курс: ${result.model.exercises.length} упражнений`);
}
if (import.meta.main) await runCli(main);
