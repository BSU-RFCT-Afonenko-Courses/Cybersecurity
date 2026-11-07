import { diagnostic } from "../diagnostics.ts";
export type Resource = ReturnType<typeof resource>;
export type Configuration =
  & ReturnType<typeof defaultConfiguration>
  & Partial<ReturnType<typeof configured>>;
export const RESOURCE_ID = /^[a-z0-9][a-z0-9-]*$/;
export const CONFIG_FIELDS = new Set(["resources", "course-model", "base-url"]);
export const RESOURCE_FIELDS = new Set([
  "path",
  "include",
  "exclude",
  "profiles",
  "gitignore",
]);
export const DEFAULT_EXCLUDES = [
  "**/.git/**",
  "**/.quarto/**",
  "**/.gradle/**",
  "**/.idea/**",
  "**/.vscode/**",
  "**/build/**",
  "**/target/**",
  "**/out/**",
  "**/node_modules/**",
  "**/__pycache__/**",
  "**/_generated/**",
  "**/_book/**",
  "**/_site/**",
  "**/_output/**",
  "**/_downloads/**",
  "**/*.class",
  "**/*.jar",
  "**/*.pyc",
  "**/.DS_Store",
  "**/.gitkeep",
];
function resource(value: unknown, id: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw diagnostic(
      "DOWNLOAD.CONFIG_INVALID",
      `Ресурс ${id} должен быть словарём`,
      { id, field: "resources" },
    );
  }
  for (const key of Object.keys(value)) {
    if (!RESOURCE_FIELDS.has(key)) {
      throw diagnostic(
        "DOWNLOAD.CONFIG_INVALID",
        `Неизвестный параметр ресурса ${id}: ${key}`,
        { id, field: key },
      );
    }
  }
  const item = value as Record<string, unknown>, path = item.path;
  if (typeof path !== "string" || !path || path === "/") {
    throw diagnostic(
      "DOWNLOAD.CONFIG_INVALID",
      `Ресурс ${id}: требуется путь к каталогу материалов`,
      { id, field: "path" },
    );
  }
  const list = (value: unknown, key: string) => {
    if (value == null) return value;
    const nonempty = (v: unknown): v is string => typeof v === "string" && !!v;
    if (!Array.isArray(value) || !value.every(nonempty)) {
      throw diagnostic(
        "DOWNLOAD.CONFIG_INVALID",
        `Ресурс ${id}: ${key} должен быть списком непустых строк`,
        { id, field: key },
      );
    }
    return value;
  };
  const include = list(item.include, "include"),
    exclude = list(item.exclude, "exclude"),
    profiles = list(item.profiles, "profiles"),
    gitignore = item.gitignore;
  if (gitignore != null && typeof gitignore !== "boolean") {
    throw diagnostic(
      "DOWNLOAD.CONFIG_INVALID",
      `Ресурс ${id}: gitignore должен быть логическим значением`,
      { id, field: "gitignore" },
    );
  }
  const verified = {
    path,
    ...(include === undefined ? {} : { include }),
    ...(exclude === undefined ? {} : { exclude }),
    ...(profiles === undefined ? {} : { profiles }),
    ...(gitignore === undefined ? {} : { gitignore }),
  };
  // Единственный cast выводится из фактически проверенных значений, не ручного DTO.
  // Возвращаем исходный объект: сохраняем identity, own undefined, null и prototype.
  return value as typeof verified;
}
function defaultConfiguration() {
  const resources: Record<string, Resource> = {};
  return { resources };
}
function configured(input: {}) {
  if (typeof input !== "object" || Array.isArray(input)) {
    throw diagnostic(
      "DOWNLOAD.CONFIG_INVALID",
      "project-download должен быть словарём",
    );
  }
  const value = input as Record<string, unknown>;
  for (const key of Object.keys(value)) {
    if (!CONFIG_FIELDS.has(key)) {
      throw diagnostic(
        "DOWNLOAD.CONFIG_INVALID",
        `Неизвестный параметр project-download: ${key}`,
        { field: key },
      );
    }
  }
  const model = value["course-model"], base = value["base-url"];
  if (model != null && typeof model !== "boolean") {
    throw diagnostic(
      "DOWNLOAD.CONFIG_INVALID",
      "project-download.course-model должен быть логическим значением",
    );
  }
  if (base !== undefined && typeof base !== "string") {
    throw diagnostic(
      "DOWNLOAD.CONFIG_INVALID",
      "project-download.base-url должен быть строкой",
    );
  }
  const resources = value.resources ?? {};
  if (!resources || typeof resources !== "object" || Array.isArray(resources)) {
    throw diagnostic(
      "DOWNLOAD.CONFIG_INVALID",
      "project-download.resources должен быть словарём",
    );
  }
  for (const [id, item] of Object.entries(resources)) {
    if (!RESOURCE_ID.test(id)) {
      throw diagnostic(
        "DOWNLOAD.CONFIG_INVALID",
        `Недопустимый идентификатор ресурса: ${id}`,
        { id, field: "resources" },
      );
    }
    resource(item, id);
  }
  return {
    resources: resources as Record<string, Resource>,
    "course-model": model,
    "base-url": base,
  };
}

/** Публичный тип — inferred guarded output с optional полями фактического default. */
export function configuration(input: unknown): Configuration {
  if (input == null) return defaultConfiguration();
  return configured(input);
}
