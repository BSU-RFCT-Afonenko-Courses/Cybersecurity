import { finalize } from "../application/workflow.ts";
import { runtime } from "../infrastructure/runtime.ts";
if (Deno.env.get("PROJECT_PUBLISH_MEMBER") !== "1") await finalize(runtime());
