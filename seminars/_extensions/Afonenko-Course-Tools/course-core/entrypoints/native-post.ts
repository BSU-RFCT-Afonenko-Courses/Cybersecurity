import { finishNativePostHook } from "../runtime/operation.ts";
await finishNativePostHook(Deno.env.get("QUARTO_PROJECT_DIR") || Deno.cwd());
