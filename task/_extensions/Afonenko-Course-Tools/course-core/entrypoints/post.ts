import { runCli } from "./diagnostics.ts";
import {
  currentNativeOutputs,
  finishNativeRun,
  saveNativeRun,
} from "../infrastructure/native-run.ts";
import { finalizeAssessmentPreview, finalizePublicSolutionWitness } from "./preview.ts";
import { assembleRelease } from "../domain/release.ts";
import { validateRelease } from "../infrastructure/validate.ts";
await runCli(async () => {
const root = Deno.env.get("QUARTO_PROJECT_DIR") || Deno.cwd();
// Native hooks can notify without rendered outputs (for example on preview startup).
// Only a nonempty current public inventory can complete the current bridge run.
if ((await currentNativeOutputs(root)).length) {
  const run = await finishNativeRun(root);
  await finalizePublicSolutionWitness(run);
  await finalizeAssessmentPreview(run);
  if(run.renderAll && run.documents.length && !run.documents.every(doc=>doc.document.exportContext===true)){
    const release=assembleRelease(run.documents.map(doc=>doc.source),run.documents,run.adapters,{view:run.documents[0].course.view,profiles:run.profiles});
    await validateRelease(release,root,run.adapters);
  }
  await saveNativeRun(run,true);
  console.log(`Курс: ${run.documents.length} текущих native-документов`);
}

});
