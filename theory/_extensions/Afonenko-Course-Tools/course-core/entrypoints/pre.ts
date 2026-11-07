import { beginNativePreHook } from "../runtime/operation.ts";
await beginNativePreHook(Deno.env.get("QUARTO_PROJECT_DIR") || Deno.cwd());
