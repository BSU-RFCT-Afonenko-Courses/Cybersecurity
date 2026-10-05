import { check } from "../application/check.ts";
import { enabled } from "../infrastructure/hooks.ts";
import { runtime } from "../infrastructure/runtime.ts";
if (await enabled()) {
  const result = await check(runtime(await Deno.realPath(Deno.cwd()), [], false));
  console.log(`Курс: заданий — ${result.model.exercises.length}, занятий — ${result.model.assessments.length}`);
}
