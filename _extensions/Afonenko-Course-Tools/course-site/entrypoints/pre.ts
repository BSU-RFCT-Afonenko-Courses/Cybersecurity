import { runHook } from "../infrastructure/diagnostics.ts";
import { pre } from "../application/compose.ts";
await runHook(() => pre());
