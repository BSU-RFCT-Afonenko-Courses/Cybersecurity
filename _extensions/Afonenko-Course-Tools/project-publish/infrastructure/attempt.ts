import type { BeforeRenderContext, BuildState } from "../domain/model.ts";
import { isAbsolute, join, relative, resolve } from "./files.ts";

/** Контекст не позволяет callback изменить данные следующего callback или сохранённый state. */
export function context(state: BuildState): BeforeRenderContext {
  const w = structuredClone(state.workspace);
  return {
    root: w.root,
    sourceRoot: state.sourceRoot,
    attemptId: state.id,
    profiles: w.profiles,
    config: w.config,
    portal: structuredClone(state.portal),
    members: w.members.map((member) => ({
      ...member,
      path: join(state.sourceRoot, relative(w.root, member.path)),
    })),
  };
}
/** Registration can only select configured modules, in their existing order. */
export function failurePaths(state: BuildState): string[] {
  if (state.failureIntegrations === undefined) return [];
  const paths = state.failureIntegrations;
  if (
    !Array.isArray(paths) || paths.some((path) => typeof path !== "string") ||
    new Set(paths).size !== paths.length ||
    JSON.stringify(paths) !== JSON.stringify(
        [...new Set(state.workspace.integrations)].filter((path) =>
          paths.includes(path)
        ),
      )
  ) {
    throw new Error("Публикация: повреждена регистрация failure callbacks");
  }
  return paths;
}
/** Проверяем владение путями перед использованием сохранённого состояния для очистки. */
export function owned(state: BuildState, root: string): void {
  const w = state?.workspace;
  const invalid = () => {
    throw new Error(
      "Публикация: повреждено состояние попытки; выполните новый render",
    );
  };
  if (
    !w || w.root !== root ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      state.id,
    ) ||
    state.sourceRoot !==
      join(root, ".project-publish", "builds", state.id, "sources") ||
    typeof w.output !== "string" || !Array.isArray(state.members) ||
    !Array.isArray(w.members) || !Array.isArray(w.integrations)
  ) invalid();
  failurePaths(state);
  const project = w.config?.project as Record<string, unknown> | undefined;
  const pub = w.config?.["project-publish"] as
    | Record<string, unknown>
    | undefined;
  const requested = w.portal
    ? pub?.["output-dir"]
    : state.outputOverride ?? project?.["output-dir"] ?? "_site";
  if (typeof requested !== "string") invalid();
  const output = resolve(root, requested as string);
  if (
    !/^[A-Za-z_][A-Za-z0-9_-]*$/.test(relative(root, output)) ||
    w.output !== output || !w.outputs?.includes(relative(root, output))
  ) invalid();
  const inside = (parent: string, path: string) => {
    const rel = relative(parent, path);
    return !rel ||
      (rel !== ".." && !rel.startsWith("../") && !rel.startsWith("..\\") &&
        !isAbsolute(rel));
  };
  if (
    w.nativeOutput !==
      resolve(root, project?.["output-dir"] as string || "_site")
  ) invalid();
  if (w.portal) {
    const portal = state.portal;
    if (
      project?.["output-dir"] !== ".project-publish/native" ||
      pub?.home !== undefined || typeof pub?.portal !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9_.-]*\.qmd$/.test(pub.portal) ||
      w.portal !== join(root, pub.portal) || !portal ||
      portal.input !== join(state.sourceRoot, pub.portal) ||
      portal.output !==
        join(root, ".project-publish", "builds", state.id, "portal") ||
      portal.control !== join(state.sourceRoot, "_quarto-publish-portal.yml") ||
      !/^[0-9a-f]{64}$/.test(portal.controlHash) ||
      JSON.stringify(portal.renderProfiles) !==
        JSON.stringify([...w.profiles, "publish-portal"]) ||
      (state.outputOverride &&
        resolve(root, state.outputOverride) !== w.nativeOutput)
    ) invalid();
    if (
      !portal?.configHashes || typeof portal.configHashes !== "object" ||
      Array.isArray(portal.configHashes) ||
      portal.configHashes[portal.control] !== portal.controlHash
    ) invalid();
    for (const [path, digest] of Object.entries(portal!.configHashes)) {
      if (
        !inside(state.sourceRoot, path) || path === state.sourceRoot ||
        typeof digest !== "string" || !/^[0-9a-f]{64}$/.test(digest)
      ) invalid();
    }
  } else if (state.portal) invalid();
  // Сохранённый output не даёт права удалять авторские исходники или интеграции.
  for (const path of [...w.members.map((m) => m.path), ...w.integrations]) {
    if (
      typeof path !== "string" || !inside(root, path) || path === root ||
      inside(output, path) || inside(path, output)
    ) invalid();
  }
  if (state.members.length !== w.members.length) invalid();
  const namespaces = new Set<string>();
  for (let index = 0; index < state.members.length; index++) {
    const member = state.members[index], configured = w.members[index];
    if (
      !member || !configured || namespaces.has(member.namespace) ||
      !/^[A-Za-z][A-Za-z0-9_-]*$/.test(member.namespace) ||
      member.namespace !== configured.namespace ||
      member.format !== configured.format ||
      member.mount !== configured.mount ||
      (member.mount !== "" && !/^[A-Za-z][A-Za-z0-9_-]*$/.test(member.mount)) ||
      member.output !==
        join(
          root,
          ".project-publish",
          "builds",
          state.id,
          "output",
          member.namespace,
        )
    ) invalid();
    namespaces.add(member.namespace);
  }
}
