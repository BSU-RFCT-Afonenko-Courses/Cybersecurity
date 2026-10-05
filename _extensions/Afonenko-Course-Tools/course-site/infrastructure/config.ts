import {
  inside,
  isAbsolute,
  join,
  outputDirectory,
  resolve,
  safePath,
  within,
} from "./files.ts";
import { profileArguments, quarto } from "./process.ts";
export interface Project {
  id: string;
  path: string;
  format: string;
  mount: string;
}
export interface Workspace {
  root: string;
  output: string;
  profiles: string[];
  projects: Project[];
  config: any;
}
export async function inspect(root: string, profiles: string[]): Promise<any> {
  return JSON.parse(
    await quarto(["inspect", root, ...profileArguments(profiles)], root),
  ).config;
}
export function activeProfiles(): string[] {
  const profiles = (Deno.env.get("QUARTO_PROFILE") || "").split(",").filter(
    Boolean,
  );
  if (
    new Set(profiles).size !== profiles.length ||
    profiles.some((p) => !/^[\w][\w.-]*$/.test(p))
  ) throw new Error("course-site invalid profiles");
  return profiles;
}
export async function validateConfig(
  root: string,
  config: any,
  profiles: string[],
): Promise<Workspace> {
  root = resolve(root);
  if (config.project?.type !== "website") {
    throw new Error("course-site root must be a native website");
  }
  const output = await outputDirectory(
    root,
    config.project["output-dir"] || "_site",
  );
  const raw = config["course-site"]?.projects;
  if (!Array.isArray(raw) || !raw.length) {
    throw new Error("course-site.projects must be a nonempty array");
  }
  const projects: Project[] = [];
  for (const item of raw) {
    if (
      !item || typeof item.id !== "string" ||
      !/^[A-Za-z][\w-]*$/.test(item.id) || typeof item.path !== "string" ||
      typeof item.mount !== "string" || !item.mount ||
      typeof item.format !== "string" || !/^[\w-]+$/.test(item.format)
    ) throw new Error("course-site invalid project");
    if (item.id === "root" || isAbsolute(item.path) || isAbsolute(item.mount)) {
      throw new Error(
        "course-site project paths must be relative; root id is reserved",
      );
    }
    if (
      Object.keys(item).some((k) =>
        !["id", "path", "format", "mount"].includes(k)
      )
    ) throw new Error("course-site unknown project option");
    const path = within(root, item.path), mount = within(output, item.mount);
    await safePath(root, path);
    await safePath(root, mount);
    if (
      !(await Deno.stat(path)).isDirectory || inside(output, path) ||
      inside(path, output)
    ) throw new Error("course-site source/output overlap");
    for (const prev of projects) {
      if (
        prev.id === item.id || inside(prev.path, path) ||
        inside(path, prev.path) || inside(within(output, prev.mount), mount) ||
        inside(mount, within(output, prev.mount))
      ) throw new Error("course-site duplicate/overlapping projects or mounts");
    }
    projects.push({
      id: item.id,
      path,
      mount: item.mount,
      format: item.format,
    });
  }
  return { root, output, projects, profiles, config };
}
export async function workspace(root: string): Promise<Workspace> {
  const profiles = activeProfiles(), config = await inspect(root, profiles);
  const override = Deno.env.get("QUARTO_PROJECT_OUTPUT_DIR");
  if (override) config.project["output-dir"] = override;
  return await validateConfig(root, config, profiles);
}

export async function validateAudienceOutputs(
  root: string,
  profiles: string[],
  selectedOutput: string,
): Promise<void> {
  const selectedAudience = profiles.find((profile) =>
    profile === "student" || profile === "full"
  );
  const alternatives = selectedAudience
    ? ["student", "full"].filter((profile) => profile !== selectedAudience)
    : ["student", "full"];
  for (const audience of alternatives) {
    let present = false;
    for (const suffix of ["yml", "yaml"]) {
      try {
        await Deno.stat(join(root, `_quarto-${audience}.${suffix}`));
        present = true;
      } catch (error) {
        if (!(error instanceof Deno.errors.NotFound)) throw error;
      }
    }
    if (!present) continue;
    const selection = selectedAudience
      ? profiles.map((profile) =>
        profile === selectedAudience ? audience : profile
      )
      : [...profiles, audience];
    const alternate = await inspect(root, selection);
    const output = await outputDirectory(
      root,
      alternate.project?.["output-dir"] || "_site",
    );
    if (inside(output, selectedOutput) || inside(selectedOutput, output)) {
      throw new Error(
        `course-site selected output overlaps ${audience} output: ${output}`,
      );
    }
  }
}
