import { beginNativeRun } from "../infrastructure/native-run.ts";
await beginNativeRun(Deno.env.get("QUARTO_PROJECT_DIR") || Deno.cwd());
