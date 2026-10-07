// Run with: quarto run CI/cue-validation.ts
import { dirname, fromFileUrl, join } from "stdlib/path";
import type { ReleaseResult } from "../_extensions/Afonenko-Course-Tools/course-core/domain/model.ts";

const repository = dirname(dirname(fromFileUrl(import.meta.url)));

if (Deno.args[0] === "case") {
  const [, scope, projectRoot, mode] = Deno.args;
  const { validateRelease } = await import(new URL(
    `../${scope === "." ? "" : scope + "/"}_extensions/Afonenko-Course-Tools/course-core/infrastructure/validate.ts`,
    import.meta.url,
  ).href);
  const result: ReleaseResult = {
    scope: "release", documents: [],
    model: {
      course: { id: mode === "invalid" ? "Invalid_ID" : "windows-check", view: "student" },
      registeredTargets: [], exercises: [], assessments: [],
    },
  };
  let rejected = false;
  try {
    await validateRelease(result, projectRoot);
  } catch (error) {
    if (mode !== "invalid" || !(error instanceof Error) ||
        error.name !== "ExternalToolFailure" ||
        (error as Error & { exitCode?: number }).exitCode !== 1 ||
        !error.message.includes("course.id")) throw error;
    rejected = true;
  }
  if (rejected !== (mode === "invalid")) {
    throw Error("CUE must reject the invalid course ID");
  }
  for await (const entry of Deno.readDir(projectRoot)) {
    if (entry.name.endsWith(".json")) {
      throw Error("Validation left a temporary JSON file: " + entry.name);
    }
  }
} else {
  // Keep fixtures on the schema's volume when the test runs on Windows.
  const temp = await Deno.makeTempDir({ dir: repository, prefix: ".course-cue-test-" });
  let count = 0;
  try {
    const foreignTemp = join(temp, "system-temp");
    await Deno.mkdir(foreignTemp);
    const denoDir = Deno.env.get("DENO_DIR");
    if (!denoDir) throw Error("Run this test through quarto run");
    const cue = Deno.env.get("CUE") || "cue";
    for (const scope of [".", "theory", "task", "seminars"]) {
      for (const mode of ["valid", "invalid"]) {
        const projectRoot = join(temp, scope === "." ? "root" : scope, mode);
        await Deno.mkdir(projectRoot, { recursive: true });
        // System temp represents another volume. Only project-local writes
        // are permitted, so the old default-temp allocation fails on Linux too.
        const child = await new Deno.Command(Deno.execPath(), {
          args: [
            "run", "--no-check", "--cached-only",
            "--import-map=" + join(denoDir, "..", "run_import_map.json"),
            "--allow-read=" + repository + "," + projectRoot,
            "--allow-write=" + projectRoot,
            "--allow-env=CUE", "--allow-run=" + cue,
            fromFileUrl(import.meta.url), "case", scope, projectRoot, mode,
          ],
          cwd: repository,
          env: { TMPDIR: foreignTemp, TMP: foreignTemp, TEMP: foreignTemp },
          stdout: "piped", stderr: "piped",
        }).output();
        if (!child.success) {
          throw Error(`${scope}/${mode}: ` + new TextDecoder().decode(child.stderr));
        }
        count++;
      }
    }
  } finally {
    await Deno.remove(temp, { recursive: true });
  }
  console.log(`PASS project-local CUE validation and cleanup: ${count} cases`);
}
