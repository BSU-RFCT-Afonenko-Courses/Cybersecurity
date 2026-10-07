import { runHook } from "../infrastructure/diagnostics.ts";
import { collect } from "../infrastructure/collection.ts";
await runHook(() => collect());
