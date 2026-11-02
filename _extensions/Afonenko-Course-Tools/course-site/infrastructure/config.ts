import { contextualize, diagnostic } from "./diagnostics.ts";
import {
  inside,
  isAbsolute,
  join,
  outputDirectory,
  relative,
  resolve,
  safePath,
  within,
} from "./files.ts";
import { profileArguments, quarto } from "./process.ts";
function projectRecord(
  path: string,
  mount: string,
  to: "default" | "html" | "revealjs",
) {
  return { id: `subproject-${encodeURIComponent(mount)}`, path, mount, to };
}
export type Project = ReturnType<typeof projectRecord>;
export type Workspace = Awaited<ReturnType<typeof workspace>>;
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
  ) {
    throw diagnostic(
      "SITE.CONFIG_INVALID",
      "Некорректные или повторяющиеся профили",
      {
        source: Deno.cwd(),
        field: "QUARTO_PROFILE",
        hint: "Укажите уникальные имена профилей.",
      },
    );
  }
  return profiles;
}
export async function validateConfig(
  root: string,
  config: any,
  profiles: string[],
) {
  root = resolve(root);
  if (config.project?.type !== "website") {
    throw diagnostic(
      "SITE.CONFIG_INVALID",
      "Корневой проект должен иметь тип website",
      {
        source: root,
        field: "project.type",
        hint: "Задайте project.type: website.",
      },
    );
  }
  const output = await outputDirectory(
    root,
    config.project["output-dir"] || "_site",
  );
  if (config["course-site"] !== undefined) {
    throw diagnostic(
      "SITE.CONFIG_INVALID",
      "Прежняя конфигурация course-site заменена списком subprojects",
      {
        source: root,
        field: "course-site",
        hint: "Перенесите пути компонентов в subprojects.",
      },
    );
  }
  const raw = config.subprojects;
  if (
    !Array.isArray(raw) || !raw.length ||
    raw.some((item) =>
      !item || typeof item !== "object" || Array.isArray(item) ||
      Object.keys(item).length !== 2 || !Object.hasOwn(item, "path") ||
      !Object.hasOwn(item, "to") ||
      typeof item.path !== "string" || !item.path ||
      !["default", "html", "revealjs"].includes(item.to)
    )
  ) {
    throw diagnostic(
      "SITE.CONFIG_INVALID",
      "subprojects должен быть непустым списком {path, to}",
      {
        source: root,
        field: "subprojects",
        hint:
          "Например: subprojects: [{path: theory, to: default}]. Допустимы default, html, revealjs.",
      },
    );
  }
  const projects: Project[] = [];
  for (const { path: item, to } of raw) {
    if (isAbsolute(item) || /^[a-z][a-z0-9+.-]*:/i.test(item)) {
      throw diagnostic(
        "SITE.SUBPROJECT_INVALID",
        "Путь компонента должен быть относительным",
        {
          source: root,
          field: "subprojects",
          related: [{ source: item }],
          hint: "Укажите папку внутри корневого проекта.",
        },
      );
    }
    let path: string;
    try {
      path = within(root, item);
    } catch (error) {
      throw contextualize(error, {
        source: root,
        field: "subprojects",
        related: [{ source: item }],
      });
    }
    const mount = relative(root, path).replaceAll("\\", "/");
    try {
      await safePath(root, path);
      await safePath(root, within(output, mount));
    } catch (error) {
      throw contextualize(error, {
        source: root,
        field: "subprojects",
        related: [{ source: item }],
      });
    }
    let stat: Deno.FileInfo;
    try {
      stat = await Deno.stat(path);
    } catch (cause) {
      if (!(cause instanceof Deno.errors.NotFound)) throw cause;
      throw diagnostic(
        "SITE.SUBPROJECT_INVALID",
        "Папка компонента отсутствует",
        {
          source: root,
          id: `subproject-${encodeURIComponent(mount)}`,
          field: "subprojects",
          related: [{ source: path }],
          hint: "Укажите существующую папку самостоятельного проекта.",
        },
        cause,
      );
    }
    if (!stat.isDirectory) {
      throw diagnostic(
        "SITE.SUBPROJECT_INVALID",
        "Компонент должен быть папкой",
        {
          source: root,
          id: `subproject-${encodeURIComponent(mount)}`,
          field: "subprojects",
          related: [{ source: path }],
          hint: "Укажите папку с собственной конфигурацией Quarto.",
        },
      );
    }
    if (inside(output, path) || inside(path, output)) {
      throw diagnostic(
        "SITE.OUTPUT_OVERLAP",
        "Источники компонента и каталог результата пересекаются",
        {
          source: root,
          id: `subproject-${encodeURIComponent(mount)}`,
          field: "subprojects",
          related: [{ source: path }, {
            source: output,
            field: "project.output-dir",
          }],
          hint: "Разделите исходники и результат.",
        },
      );
    }
    for (const prev of projects) {
      if (inside(prev.path, path) || inside(path, prev.path)) {
        throw diagnostic(
          "SITE.SUBPROJECT_INVALID",
          "Компоненты повторяются или вложены друг в друга",
          {
            source: root,
            field: "subprojects",
            related: [{ source: path }, { source: prev.path, id: prev.id }],
            hint: "Оставьте непересекающиеся папки компонентов.",
          },
        );
      }
    }
    projects.push(projectRecord(path, mount, to));
  }
  return { root, output, projects, profiles, config };
}
export async function workspace(root: string) {
  const profiles = activeProfiles();
  const project = JSON.parse(
    await quarto(["inspect", root, ...profileArguments(profiles)], root),
  );
  const config = project.config;
  const override = Deno.env.get("QUARTO_PROJECT_OUTPUT_DIR");
  if (override) config.project["output-dir"] = override;
  return {
    ...await validateConfig(root, config, profiles),
    resources: project.files?.resources || [],
    selectedSources: Deno.env.get("QUARTO_PROJECT_RENDER_ALL") === "1"
      ? await selectedSources(root, project.files?.input)
      : undefined,
  };
}

/** Чистый preflight: metadata не разрешают author выдачу в student audience. */
export function validateAudience(
  root: string,
  profiles: string[],
  view?: "student" | "full",
  nativeProjection?: "student" | "author",
  expectedAudience?: "student" | "full",
) {
  const audience = expectedAudience ??
    profiles.find((profile) => profile === "student" || profile === "full") ??
    view ??
    (nativeProjection === undefined
      ? undefined
      : nativeProjection === "author"
      ? "full"
      : "student");
  if (view !== undefined && view !== audience) {
    throw diagnostic(
      "SITE.AUDIENCE_MISMATCH",
      "course.view не совпадает с выбранной student/full аудиторией",
      {
        source: root,
        field: "course.view",
        hint:
          "Согласуйте course.view корня и native компонентов с выбранной аудиторией.",
      },
    );
  }
  if (
    nativeProjection !== undefined &&
    nativeProjection !== (audience === "full" ? "author" : "student")
  ) {
    throw diagnostic(
      "SITE.AUDIENCE_MISMATCH",
      "Native проекция Core не совпадает с выбранной student/full аудиторией",
      {
        source: root,
        field: "course-core-projection",
        hint: "Используйте student для student audience и author для full.",
      },
    );
  }
  return audience;
}

export async function validateAudienceOutputs(
  root: string,
  profiles: string[],
  selectedOutput: string,
  view?: "student" | "full",
  nativeProjection?: "student" | "author",
  expectedAudience?: "student" | "full",
  known?: { profiles: string[]; config: any },
): Promise<void> {
  const selectedAudience = validateAudience(
    root,
    profiles,
    view,
    nativeProjection,
    expectedAudience,
  );
  const alternatives = selectedAudience
    ? ["student", "full"].filter((profile) => profile !== selectedAudience)
    : ["student", "full"];
  const alternateOutputs: string[] = [];
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
    const selection = selectedAudience && profiles.includes(selectedAudience)
      ? profiles.map((profile) =>
        profile === selectedAudience ? audience : profile
      )
      : [...profiles, audience];
    const alternate =
      known && JSON.stringify(known.profiles) === JSON.stringify(selection)
        ? known.config
        : await inspect(root, selection);
    const output = await outputDirectory(
      root,
      alternate.project?.["output-dir"] || "_site",
    );
    if (
      alternateOutputs.some((other) =>
        inside(output, other) || inside(other, output)
      )
    ) {
      throw diagnostic(
        "SITE.OUTPUT_OVERLAP",
        "Каталоги student и full пересекаются",
        {
          source: root,
          field: "project.output-dir",
          related: [...alternateOutputs, output].map((source) => ({ source })),
          hint: "Задайте отдельные каталоги для каждой аудитории.",
        },
      );
    }
    alternateOutputs.push(output);
    // When native defaults/groups select an unknown audience, its output may
    // equal one canonical projection. The pair must remain disjoint, and a
    // partial overlap is never safe. Profile filenames do not prove activation:
    // ordinary metadata-files can use exactly those names.
    if (
      (selectedAudience || output !== selectedOutput) &&
      (inside(output, selectedOutput) || inside(selectedOutput, output))
    ) {
      throw diagnostic(
        "SITE.OUTPUT_OVERLAP",
        `Выбранный каталог пересекается с результатом ${audience}`,
        {
          source: root,
          field: "project.output-dir",
          related: [{ source: selectedOutput }, { source: output }],
          hint: "Разделите каталоги аудиторий.",
        },
      );
    }
  }
}

/** Настоящий native project selected set; форматы документов здесь не вычисляются. */
async function selectedSources(
  root: string,
  inputs: unknown,
): Promise<string[]> {
  if (
    !Array.isArray(inputs) || inputs.some((input) => typeof input !== "string")
  ) {
    throw diagnostic(
      "SITE.SUBPROJECT_INVALID",
      "Native inspect не вернул список inputs",
      { source: root, field: "input" },
    );
  }
  const selected: string[] = [], unique = new Set<string>();
  for (const input of inputs) {
    const path = within(root, input);
    try {
      await safePath(root, path);
    } catch (error) {
      throw contextualize(error, {
        source: root,
        field: "input",
        related: [{ source: input }],
      });
    }
    if (!(await Deno.lstat(path)).isFile) {
      throw diagnostic(
        "SITE.SUBPROJECT_INVALID",
        "Выбранный источник не является файлом",
        {
          source: root,
          field: "input",
          related: [{ source: input }],
          hint: "Выберите обычный исходный документ.",
        },
      );
    }
    const name = relative(root, path).replaceAll("\\", "/");
    if (unique.has(name)) {
      throw diagnostic("SITE.SUBPROJECT_INVALID", "Native inputs повторяются", {
        source: root,
        field: "input",
        related: [{ source: input }],
      });
    }
    unique.add(name);
    selected.push(name);
  }
  return selected;
}
export async function inspectProject(root: string, profiles: string[]) {
  const project = JSON.parse(
    await quarto(["inspect", root, ...profileArguments(profiles)], root),
  );
  return {
    config: project.config,
    selectedSources: await selectedSources(root, project.files?.input),
    resources: project.files?.resources || [],
  };
}
