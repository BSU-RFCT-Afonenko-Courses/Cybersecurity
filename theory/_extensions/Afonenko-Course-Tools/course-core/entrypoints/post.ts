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
    const {join,dirname,relative}=await import("stdlib/path");
    for(const doc of run.documents){
      const path=join(run.outputDirectory,doc.document.output);
      if(!path.endsWith(".html"))continue;
      const html=await Deno.readTextFile(path);
      if(!html.includes("<!--course-exercise-index"))continue;
      const {renderExerciseIndex}=await import("../../course-navigation/exercise-index.ts");
      const renderIndex=(request:import("../../course-navigation/exercise-index.ts").ExerciseIndexRequest)=>renderExerciseIndex(release.model,(source,id)=>{const target=run.documents.find(d=>d.source===source);if(!target)throw Error("Index target absent from current native run");return relative(dirname(path),join(run.outputDirectory,target.document.output)).replaceAll("\\","/")+"#"+id;},request);
      await Deno.writeTextFile(path,html.replace(/<!--course-exercise-index(?::(.*?))?-->/g,(_marker,request)=>renderIndex(request?JSON.parse(request):{})));
    }
  }
  await saveNativeRun(run,true);
  console.log(`Курс: ${run.documents.length} текущих native-документов`);
}

});
