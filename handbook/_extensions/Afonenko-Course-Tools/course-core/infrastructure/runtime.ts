import { dirname, fromFileUrl, join, relative } from "stdlib/path";
import type { CheckPorts } from "../application/check.ts";
import type { AdapterFragment, Fragment } from "../domain/model.ts";
import { adapters } from "./adapters.ts";
import { checkPaths, exists, fragments } from "./files.ts";
import { command, quartoExecutable } from "./process.ts";
export function runtime(root: string, explicit: string[], render = true): CheckPorts {
  const extension = dirname(dirname(fromFileUrl(import.meta.url)));
  const generated = join(root, "_generated/course-spec");
  const candidate = join(generated, "course-candidate.json");
  const quarto = quartoExecutable(), cue = Deno.env.get("CUE") || "cue";
  return {
    async prepare() {
      if (render) for (const name of ["core", "course.json", "course-candidate.json"]) {
        const path = join(generated, name);
        if (await exists(path)) await Deno.remove(path, { recursive: true });
      }
      await Deno.mkdir(generated, { recursive: true });
      await command(cue, ["version"], root);
      const inspected = JSON.parse(await command(quarto, ["inspect", root], root));
      const selected = inspected.config.course?.adapters ?? [];
      if (!Array.isArray(selected) || selected.some((value: unknown) => typeof value !== "string")) throw new Error("course.adapters должен быть списком имён адаптеров");
      return await adapters(root, [...selected, ...explicit]);
    },
    async render() {
      if (render) await command(quarto, ["render", ".", "--to", "html", "--fail-if-warnings"], root, { COURSE_CHECK_ACTIVE: "1" });
    },
    async extract(items) {
      const inspected = JSON.parse(await command(quarto, ["inspect", root], root));
      const selected: string[] = inspected.files.input.map((path: string) => relative(root, path).replaceAll("\\", "/"));
      for (const item of items) item.fragments = await fragments<AdapterFragment>(root, item.contract.name, selected);
      return { selected, fragments: await fragments<Fragment>(root, "core", selected) };
    },
    async validate(model, items) {
      await checkPaths(root, model);
      await Deno.writeTextFile(candidate, JSON.stringify(model, null, 2) + "\n");
      const schemas = [join(extension, "spec/core.cue"), ...items.map(a => join(a.directory, a.contract.rules))];
      await command(cue, ["vet", ...schemas, candidate, "-d", "#Course", "-c", "--all-errors"], root);
    },
    async save() {
      const path = join(generated, "course.json");
      await Deno.rename(candidate, path);
      return path;
    },
  };
}
