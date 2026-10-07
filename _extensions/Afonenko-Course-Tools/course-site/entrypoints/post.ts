import { runHook } from "../infrastructure/diagnostics.ts";
import { post } from "../application/compose.ts";
await runHook(() => post());
