/** Единый словарь конфигурации и поддерживаемых результатов. */
export const formats = ["html", "revealjs", "pdf"] as const;
export type Format = typeof formats[number];
export const configKeys = [
  "home",
  "portal",
  "output-dir",
  "projects",
  "integrations",
] as const;
export const memberKeys = ["path", "mount", "format"] as const;
export const ignoredDirectories = [
  ".project-publish",
  ".qrc",
  ".quarto",
  ".git",
  "node_modules",
  "site_libs",
  "_generated",
  "_book",
  "_site",
  "_output",
];
export const mimeTypes: Record<string, string> = {
  html: "text/html; charset=utf-8",
  js: "text/javascript",
  css: "text/css",
  json: "application/json",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  woff: "font/woff",
  woff2: "font/woff2",
  pdf: "application/pdf",
};
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function checkKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  context: string,
) {
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) {
      throw new Error(`Публикация: неизвестное свойство ${context}.${key}`);
    }
  }
}
