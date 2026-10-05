import {
  currentNativeOutputs,
  finishNativeRun,
} from "../infrastructure/native-run.ts";
const root = Deno.env.get("QUARTO_PROJECT_DIR") || Deno.cwd();
// Native hooks can notify without rendered outputs (for example on preview startup).
// Only a nonempty current public inventory can complete the current bridge run.
if ((await currentNativeOutputs(root)).length) {
  const run = await finishNativeRun(root);
  console.log(`Course: ${run.documents.length} current native documents`);
}
