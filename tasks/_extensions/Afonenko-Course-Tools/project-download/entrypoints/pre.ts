import { prepare } from "../infrastructure/runtime.ts";
await prepare(await Deno.realPath(Deno.cwd()));
