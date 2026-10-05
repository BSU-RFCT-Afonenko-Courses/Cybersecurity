import { loadNativeRun } from "../infrastructure/native-run.ts";
import { assembleRelease } from "../domain/release.ts";
import { validateRelease } from "../infrastructure/validate.ts";
export async function main(args = Deno.args) {
  const [root = ".", view] = args;
  if (view !== "student" && view !== "full") {
    throw Error("Usage: quarto run check.ts PROJECT student|full");
  }
  const run = await loadNativeRun(root, { view });
  if (!run.renderAll) throw Error("RELEASE.FULL_NATIVE_RUN_REQUIRED");
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
  console.log(`Course: ${result.model.exercises.length} exercises`);
}
if (import.meta.main) await main();
