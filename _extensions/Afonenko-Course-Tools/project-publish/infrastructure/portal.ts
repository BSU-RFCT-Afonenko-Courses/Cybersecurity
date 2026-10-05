import type { BuildState } from "../domain/model.ts";
import { isAbsolute, join, relative } from "./files.ts";
import { quarto } from "./process.ts";
import { profileArguments } from "./profiles.ts";

export async function hash(path: string): Promise<string> {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", await Deno.readFile(path)),
    ),
  ).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
/** Native profile — только selection; авторские configs не переписываются. */
export async function preparePortal(state: BuildState): Promise<void> {
  const w = state.workspace;
  if (!w.portal) return;
  const name = "publish-portal";
  const control = join(state.sourceRoot, `_quarto-${name}.yml`);
  await Deno.writeTextFile(
    control,
    JSON.stringify({
      project: {
        render: [relative(w.root, w.portal)],
        resources: [`!_quarto-${name}.yml`],
      },
    }),
  );
  const renderProfiles = [...w.profiles, name];
  const inspected = JSON.parse(
    await quarto(
      ["inspect", state.sourceRoot, ...profileArguments(renderProfiles)],
      state.sourceRoot,
      { QUARTO_PROJECT_OUTPUT_DIR: "", QUARTO_PROFILE: "" },
    ),
  );
  const inputs = inspected.files?.input ?? [];
  const configured = inspected.config.project.render;
  const input = join(state.sourceRoot, relative(w.root, w.portal));
  if (
    !Array.isArray(configured) || configured.length !== 1 ||
    configured[0] !== relative(w.root, w.portal) || inputs.length !== 1 ||
    inputs[0] !== input
  ) {
    throw new Error(
      "Публикация native portal selection должна содержать только выбранный root QMD",
    );
  }
  const configHashes: Record<string, string> = {};
  for (const path of inspected.files.config) {
    const rel = relative(state.sourceRoot, path);
    if (!rel || rel === ".." || rel.startsWith("../") || isAbsolute(rel)) {
      throw new Error("Публикация portal config вне snapshot");
    }
    configHashes[path] = await hash(path);
  }
  state.portal = {
    input,
    output: join(w.root, ".project-publish", "builds", state.id, "portal"),
    renderProfiles,
    control,
    controlHash: await hash(control),
    configHashes,
  };
}
export async function unchangedPortal(state: BuildState): Promise<void> {
  if (!state.portal) return;
  if (await hash(state.portal.control) !== state.portal.controlHash) {
    throw new Error("Публикация portal control изменён после подготовки");
  }
  for (const [path, expected] of Object.entries(state.portal.configHashes)) {
    if (await hash(path) !== expected) {
      throw new Error(
        `Публикация portal config изменён после подготовки: ${path}`,
      );
    }
  }
}
