import { join } from "stdlib/path";
import { exists } from "../infrastructure/files.ts";
import { enabled } from "../infrastructure/hooks.ts";
// Обработчик подключается автором проекта явно и владеет только результатами Core.
if (await enabled()) {
  const root = join(Deno.cwd(), "_generated/course-spec");
  for (const name of ["core", "course.json", "course-candidate.json"]) {
    const path = join(root, name);
    if (await exists(path)) await Deno.remove(path, { recursive: true });
  }
}
