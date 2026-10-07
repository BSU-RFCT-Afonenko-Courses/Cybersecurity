import { diagnostic } from "../diagnostics.ts";
import { fromFileUrl, isAbsolute, resolve } from "./files.ts";

/** Путь разрешается однократно; источник может находиться за пределами проекта. */
export function normalizeCatalogSource(value: string, root: string, id?: string): string {
  if (!value.trim()) throw diagnostic("QRC.IMPORT_INVALID", "source должен содержать непустой путь или HTTP(S) URL", { source: value, id, field: "source" });
  // Платформенная библиотека путей учитывает буквы дисков Windows.
  if (isAbsolute(value)) return resolve(value);
  if (!/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) return resolve(root, value);
  let url: URL;
  try { url = new URL(value); }
  catch (cause) { throw diagnostic("QRC.IMPORT_INVALID", `некорректный URL источника импорта: ${value}`, { source: value, id, field: "source" }, cause); }
  if (url.protocol === "file:") {
    if (url.search || url.hash) throw diagnostic("QRC.IMPORT_INVALID", "источник file: не должен содержать параметры запроса или фрагмент", { source: value, id, field: "source" });
    try { return fromFileUrl(url); }
    catch (cause) { throw diagnostic("QRC.IMPORT_INVALID", `некорректный URL источника file:: ${value}`, { source: value, id, field: "source" }, cause); }
  }
  if (!["http:", "https:"].includes(url.protocol)) throw diagnostic("QRC.IMPORT_INVALID", `неподдерживаемый протокол источника импорта ${url.protocol} ; используйте файл или HTTP(S)`, { source: value, id, field: "source" });
  if (url.hash || url.username || url.password) throw diagnostic("QRC.IMPORT_INVALID", "источник HTTP(S) не должен содержать фрагмент или учётные данные", { source: value, id, field: "source" });
  return url.href;
}

function refusal(source: string, message: string, cause: unknown): Error {
  const error = new Error(`QRC ${message} ${source}: ${cause instanceof Error ? cause.message : cause}`, { cause });
  error.name = "ExternalToolFailure";
  return Object.assign(error, { tool: /^https?:\/\//.test(source) ? "HTTP" : "filesystem", source, exitCode: null, stdout: "", stderr: cause instanceof Error ? cause.message : String(cause) });
}

/** Каталог загружается на этапе подготовки общей сборки. */
export async function readCatalogSource(source: string): Promise<string> {
  if (!/^https?:\/\//.test(source)) {
    try { return await Deno.readTextFile(source); }
    catch (error) { throw refusal(source, "не удалось прочитать импортированный каталог", error); }
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(source, { signal: controller.signal });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`HTTP ${response.status} ${response.statusText}${body ? `\n${body}` : ""}`);
    }
    return await response.text();
  } catch (error) {
    throw refusal(source, controller.signal.aborted ? "не удалось загрузить импортированный каталог (сервер не ответил за 30 секунд)" : "не удалось загрузить импортированный каталог", error);
  } finally { clearTimeout(timeout); }
}
