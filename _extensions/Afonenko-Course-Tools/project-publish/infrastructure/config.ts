import { parse } from "stdlib/yaml";
import type { Member, Workspace } from "../domain/model.ts";
import {
  isAbsolute,
  join,
  relative,
  resolve,
  safeDirectory,
  within,
} from "./files.ts";
import { quarto } from "./process.ts";
import { activeProfiles, profileArguments } from "./profiles.ts";
import {
  checkKeys,
  configKeys,
  formats,
  isRecord,
  memberKeys,
} from "../domain/contract.ts";
import type { Format } from "../domain/contract.ts";
export async function workspace(root: string): Promise<Workspace> {
  const profiles = activeProfiles();
  const inspected = JSON.parse(
    await quarto(["inspect", root, ...profileArguments(profiles)], root),
  );
  const config = inspected.config;
  const pub = config["project-publish"];
  if (!isRecord(pub) || !isRecord(pub.projects)) {
    throw new Error(
      "Публикация project-publish.projects обязателен в корне составного проекта",
    );
  }
  checkKeys(pub, configKeys, "project-publish");
  if (config.project.type !== "website") {
    throw new Error(
      "Публикация корневой проект должен иметь тип website; книга подключается как подпроект",
    );
  }
  const home = pub.home;
  const portal = pub.portal;
  if (
    portal !== undefined &&
    (typeof portal !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9_.-]*\.qmd$/.test(portal))
  ) throw new Error("Публикация portal должен указывать один корневой QMD");
  if (portal !== undefined && home !== undefined) {
    throw new Error("Публикация portal несовместим с home");
  }
  if (
    portal !== undefined &&
    (!Array.isArray(config.project.render) ||
      config.project.render.length !== 0)
  ) throw new Error("Публикация portal требует project.render: []");
  if (
    portal !== undefined &&
    config.project["output-dir"] !== ".project-publish/native"
  ) {
    throw new Error(
      "Публикация portal требует private native output-dir: .project-publish/native",
    );
  }
  if (portal === undefined && pub["output-dir"] !== undefined) {
    throw new Error(
      "Публикация project-publish.output-dir применяется только с portal",
    );
  }
  if (portal !== undefined) {
    const reserved = (value: unknown): boolean =>
      value === "publish-portal" ||
      (Array.isArray(value) && value.some(reserved)) ||
      (isRecord(value) && Object.values(value).some(reserved));
    // Native inspect убирает profile после выбора. Читаем только зарезервированное имя
    // штатным stdlib YAML; effective config/merge/resources по-прежнему даёт Quarto.
    let reservedProfile = reserved(config.profile);
    for (const file of inspected.files.config) {
      const declaration = parse(await Deno.readTextFile(file));
      if (isRecord(declaration) && reserved(declaration.profile)) {
        reservedProfile = true;
      }
    }
    if (profiles.includes("publish-portal") || reservedProfile) {
      throw new Error(
        "Публикация профиль publish-portal зарезервирован для portal child",
      );
    }
    for (const ext of ["yml", "yaml"]) {
      try {
        await Deno.lstat(join(root, `_quarto-publish-portal.${ext}`));
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) continue;
        throw error;
      }
      throw new Error(
        "Публикация авторский _quarto-publish-portal запрещён: профиль принадлежит попытке",
      );
    }
    if (!(await Deno.lstat(join(root, portal as string))).isFile) {
      throw new Error("Публикация portal должен быть обычным QMD файлом");
    }
  }
  if (
    home !== undefined &&
    (typeof home !== "string" || !Object.hasOwn(pub.projects, home))
  ) {
    throw new Error(
      "Публикация home должен указывать имя настроенного подпроекта",
    );
  }
  if (
    home !== undefined &&
    (!Array.isArray(config.project.render) ||
      config.project.render.length !== 0)
  ) {
    throw new Error(
      "Публикация home требует project.render: []; главную страницу предоставляет выбранный подпроект",
    );
  }
  const requestedOutput = Deno.env.get("QUARTO_PROJECT_OUTPUT_DIR");
  const nativeOutput = resolve(root, config.project["output-dir"] || "_site");
  if (
    portal !== undefined && requestedOutput &&
    resolve(root, requestedOutput) !== nativeOutput
  ) {
    throw new Error(
      "Публикация managed portal не поддерживает --output-dir override; используйте безопасный entrypoints/render.ts",
    );
  }
  const outputName = portal !== undefined
    ? pub["output-dir"]
    : requestedOutput
    ? relative(root, resolve(root, requestedOutput))
    : config.project["output-dir"] || "_site";
  if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(outputName)) {
    throw new Error(
      "Публикация output-dir должен быть именем одного каталога, например _site",
    );
  }
  const output = within(root, outputName);
  const inside = (parent: string, path: string) => {
    const rel = relative(parent, path);
    return !rel ||
      (!rel.startsWith(".." + "/") && !rel.startsWith(".." + "\\") &&
        rel !== ".." && !isAbsolute(rel));
  };
  const members: Member[] = [];
  const used = new Set<string>();
  for (const [namespace, value] of Object.entries(pub.projects)) {
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(namespace)) {
      throw new Error(`Публикация некорректное пространство имён ${namespace}`);
    }
    const item = value as Record<string, string>;
    if (!item || typeof item.path !== "string") {
      throw new Error(`Публикация для проекта ${namespace} требуется path`);
    }
    checkKeys(item, memberKeys, `project-publish.projects.${namespace}`);
    const path = within(root, item.path);
    if (
      portal !== undefined &&
      (inside(nativeOutput, path) || inside(path, nativeOutput))
    ) throw new Error("Публикация native output и исходники пересекаются");
    if (inside(output, path) || inside(path, output)) {
      throw new Error(
        "Публикация каталоги исходников и результатов пересекаются",
      );
    }
    if (namespace === home && item.mount !== undefined) {
      throw new Error(
        `Публикация для главного проекта ${namespace} нельзя задавать mount`,
      );
    }
    const mount = namespace === home ? "" : item.mount ?? namespace;
    if (
      (mount !== "" && !/^[A-Za-z][A-Za-z0-9_-]*$/.test(mount)) ||
      used.has(mount)
    ) {
      throw new Error(
        `Публикация некорректный или повторяющийся mount ${mount}`,
      );
    }
    used.add(mount);
    const format = item.format ?? "html";
    if (!(formats as readonly string[]).includes(format)) {
      throw new Error(`Публикация неподдерживаемый формат ${format}`);
    }
    if (namespace === home && format !== "html") {
      throw new Error(
        "Публикация главный проект должен иметь формат HTML и создавать index.html",
      );
    }
    await Deno.stat(join(path, "_quarto.yml"));
    for (const profile of profiles) {
      try {
        await Deno.stat(join(path, `_quarto-${profile}.yml`));
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
          throw new Error(
            `Публикация у проекта ${namespace} отсутствует _quarto-${profile}.yml; все подпроекты должны поддерживать выбранный профиль`,
          );
        }
        throw error;
      }
    }
    members.push({ namespace, path, mount, format: format as Format });
  }
  if (!members.length) throw new Error("Публикация не заданы подпроекты");
  const integrations = pub.integrations ?? [];
  if (
    !Array.isArray(integrations) ||
    integrations.some((path) => typeof path !== "string")
  ) {
    throw new Error(
      "Публикация integrations должен содержать пути к модулям интеграции",
    );
  }
  const integrationPaths = integrations.map((path) => within(root, path));
  // Предыдущая публикация остаётся результатом сборки и при выборе другого профиля.
  const outputs = new Set([relative(root, output)]);
  const outputProfiles = new Set<string>();
  for await (const entry of Deno.readDir(root)) {
    const match = entry.isFile &&
      entry.name.match(/^_quarto-([A-Za-z0-9][A-Za-z0-9_.-]*)\.(?:yml|yaml)$/);
    if (match) outputProfiles.add(match[1]);
  }
  for (const profile of [...outputProfiles].sort()) {
    const profileConfig =
      JSON.parse(await quarto(["inspect", root, "--profile", profile], root))
        .config;
    const name = profileConfig["project-publish"]?.portal !== undefined
      ? profileConfig["project-publish"]["output-dir"]
      : profileConfig.project?.["output-dir"] || "_site";
    if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(name)) {
      throw new Error(
        `Публикация в профиле ${profile} output-dir должен быть именем одного каталога`,
      );
    }
    outputs.add(name);
  }
  if (portal !== undefined) {
    await safeDirectory(root, join(root, ".project-publish"));
    await safeDirectory(root, nativeOutput);
    for (const name of outputs) await safeDirectory(root, join(root, name));
  }
  return {
    root,
    output,
    nativeOutput,
    portal: portal === undefined ? undefined : join(root, portal as string),
    members,
    integrations: integrationPaths,
    config,
    profiles,
    outputs: [...outputs],
    home,
  };
}
