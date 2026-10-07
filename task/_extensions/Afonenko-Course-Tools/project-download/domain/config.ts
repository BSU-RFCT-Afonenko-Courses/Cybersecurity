import { diagnostic } from "../diagnostics.ts";
export interface Resource { path: string; include?: string[]; exclude?: string[]; profiles?: string[]; gitignore?: boolean }
export interface Configuration { resources: Record<string, Resource>; "course-model"?: boolean }
export const RESOURCE_ID = /^[a-z0-9][a-z0-9-]*$/;
export const CONFIG_FIELDS = new Set(["resources", "course-model"]);
export const RESOURCE_FIELDS = new Set(["path", "include", "exclude", "profiles", "gitignore"]);
export const DEFAULT_EXCLUDES = ["**/.git/**", "**/.quarto/**", "**/.gradle/**", "**/.idea/**", "**/.vscode/**", "**/build/**", "**/target/**", "**/out/**", "**/node_modules/**", "**/__pycache__/**", "**/_generated/**", "**/_book/**", "**/_site/**", "**/_output/**", "**/_downloads/**", "**/*.class", "**/*.pyc", "**/.DS_Store", "**/.gitkeep"];
export function configuration(input: unknown): Configuration {
  if (input == null) return { resources: {} };
  if (typeof input !== "object" || Array.isArray(input)) throw diagnostic("DOWNLOAD.CONFIG_INVALID", "project-download должен быть словарём");
  const value = input as Record<string, unknown>;
  for (const key of Object.keys(value)) if (!CONFIG_FIELDS.has(key)) throw diagnostic("DOWNLOAD.CONFIG_INVALID", `Неизвестный параметр project-download: ${key}`, {field:key});
  if (value["course-model"] != null && typeof value["course-model"] !== "boolean") throw diagnostic("DOWNLOAD.CONFIG_INVALID", "project-download.course-model должен быть логическим значением");
  const resources = value.resources ?? {};
  if (!resources || typeof resources !== "object" || Array.isArray(resources)) throw diagnostic("DOWNLOAD.CONFIG_INVALID", "project-download.resources должен быть словарём");
  for (const [id, resource] of Object.entries(resources)) {
    if (!RESOURCE_ID.test(id)) throw diagnostic("DOWNLOAD.CONFIG_INVALID", `Недопустимый идентификатор ресурса: ${id}`, {id,field:"resources"});
    if (!resource || typeof resource !== "object" || Array.isArray(resource)) throw diagnostic("DOWNLOAD.CONFIG_INVALID", `Ресурс ${id} должен быть словарём`, {id,field:"resources"});
    for (const key of Object.keys(resource)) if (!RESOURCE_FIELDS.has(key)) throw diagnostic("DOWNLOAD.CONFIG_INVALID", `Неизвестный параметр ресурса ${id}: ${key}`, {id,field:key});
    const item = resource as Resource;
    if (typeof item.path !== "string" || !item.path || item.path === "/") throw diagnostic("DOWNLOAD.CONFIG_INVALID", `Ресурс ${id}: требуется путь к каталогу материалов`, {id,field:"path"});
    for (const key of ["include", "exclude", "profiles"] as const) {
      if (item[key] != null && (!Array.isArray(item[key]) || item[key]!.some(v => typeof v !== "string" || !v))) throw diagnostic("DOWNLOAD.CONFIG_INVALID", `Ресурс ${id}: ${key} должен быть списком непустых строк`, {id,field:key});
    }
    if (item.gitignore != null && typeof item.gitignore !== "boolean") throw diagnostic("DOWNLOAD.CONFIG_INVALID", `Ресурс ${id}: gitignore должен быть логическим значением`, {id,field:"gitignore"});
  }
  return { resources: resources as Record<string, Resource>, "course-model": value["course-model"] as boolean | undefined };
}
