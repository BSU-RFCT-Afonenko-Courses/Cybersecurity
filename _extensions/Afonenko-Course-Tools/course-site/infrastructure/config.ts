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
export interface Project {
  id: string;
  path: string;
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
): Promise<Workspace> {
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
    raw.some((path) => typeof path !== "string" || !path)
  ) {
    throw diagnostic(
      "SITE.CONFIG_INVALID",
      "subprojects должен быть непустым списком относительных путей",
      {
        source: root,
        field: "subprojects",
        hint: "Укажите пути папок самостоятельных проектов.",
      },
    );
  }
  const projects: Project[] = [];
  for (const item of raw) {
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
    projects.push({
      id: `subproject-${encodeURIComponent(mount)}`,
      path,
      mount,
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
  view?: "student" | "full",
): Promise<void> {
  const selectedAudience =
    profiles.find((profile) => profile === "student" || profile === "full") ||
    view;
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
    const alternate = await inspect(root, selection);
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

export interface DocumentFormat {
  source: string;
  format: string;
  baseFormat: string;
  web: boolean;
}
export interface DocumentPlan {
  config: any;
  documents: DocumentFormat[];
  /** undefined: native configuration; default: native first format; null: selected files. */
  renderTo?: string | null;
}
/** Effective formats are native Quarto data, including directory metadata and profiles. */
export async function inspectDocuments(
  root: string,
  profiles: string[],
  project?: any,
): Promise<DocumentPlan> {
  project ??= JSON.parse(
    await quarto(["inspect", root, ...profileArguments(profiles)], root),
  );
  // Validate the entire selected list before inspecting any document or
  // cleaning output. Optional Core is not the source-path safety boundary.
  for (const input of project.files.input) {
    try {
      await safePath(root, within(root, input));
    } catch (error) {
      throw contextualize(error, {
        source: root,
        field: "input",
        related: [{ source: input }],
      });
    }
    if (!(await Deno.lstat(input)).isFile) {
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
  }
  const documents: DocumentFormat[] = [];
  let hasOtherFormats = false, firstSelected = true;
  for (const input of project.files.input) {
    const document = JSON.parse(
      await quarto(["inspect", input, ...profileArguments(profiles)], root),
    );
    const entries = Object.entries(document.formats) as [string, any][];
    const web = entries.filter(([, value]) =>
      value.render?.["output-ext"] === "html"
    );
    if (web.length > 1) {
      throw diagnostic(
        "SITE.FORMAT_AMBIGUOUS",
        "У документа выбрано несколько веб-форматов",
        {
          source: input,
          field: "format",
          related: [{ source: root }],
          hint: "Выберите один веб-формат в конфигурации или профиле.",
        },
      );
    }
    const selected = web.length
      ? web[0]
      : entries.length === 1
      ? entries[0]
      : undefined;
    if (!selected) {
      throw diagnostic(
        "SITE.FORMAT_AMBIGUOUS",
        "Для документа требуется один выбранный формат",
        {
          source: input,
          field: "format",
          related: [{ source: root }],
          hint: "Выберите формат отдельным профилем.",
        },
      );
    }
    const [format, value] = selected;
    documents.push({
      source: relative(root, input).replaceAll("\\", "/"),
      format,
      baseFormat: value.identifier?.["base-format"] || value.pandoc?.to ||
        format,
      web: web.length === 1,
    });
    hasOtherFormats ||= entries.length > 1;
    firstSelected &&= entries[0][0] === format;
  }
  const formats = new Set(documents.map((d) => d.format));
  const renderTo = !hasOtherFormats
    ? undefined
    : firstSelected
    ? "default"
    : project.config.project.type === "book" && formats.size === 1
    ? documents[0].format
    : null;
  return { config: project.config, documents, renderTo };
}
