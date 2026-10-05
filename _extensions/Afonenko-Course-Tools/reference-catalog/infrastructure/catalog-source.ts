import { fromFileUrl, isAbsolute, resolve } from "./files.ts";

/** Путь разрешается однократно; источник может находиться за пределами проекта. */
export function normalizeCatalogSource(value: string, root: string): string {
  if (!value.trim()) throw new Error("QRC source должен содержать непустой путь или HTTP(S) URL");
  // Платформенная библиотека путей учитывает буквы дисков Windows.
  if (isAbsolute(value)) return resolve(value);
  if (!/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) return resolve(root, value);
  let url: URL;
  try { url = new URL(value); }
  catch { throw new Error(`QRC некорректный URL источника импорта: ${value}`); }
  if (url.protocol === "file:") {
    if (url.search || url.hash) throw new Error("QRC источник file: не должен содержать параметры запроса или фрагмент");
    try { return fromFileUrl(url); }
    catch { throw new Error(`QRC некорректный URL источника file:: ${value}`); }
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error(`QRC неподдерживаемый протокол источника импорта ${url.protocol} ; используйте файл или HTTP(S)`);
  if (url.hash || url.username || url.password) throw new Error("QRC источник HTTP(S) не должен содержать фрагмент или учётные данные");
  return url.href;
}

/** Каталог загружается на этапе подготовки общей сборки. */
export async function readCatalogSource(source: string): Promise<string> {
  if (!/^https?:\/\//.test(source)) {
    try { return await Deno.readTextFile(source); }
    catch (error) { throw new Error(`QRC не удалось прочитать импортированный каталог ${source}: ${error instanceof Error ? error.message : error}`); }
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(source, { signal: controller.signal });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    return await response.text();
  } catch (error) {
    const message = controller.signal.aborted ? "сервер не ответил за 30 секунд" : error instanceof Error ? error.message : String(error);
    throw new Error(`QRC не удалось загрузить импортированный каталог ${source}: ${message}`);
  } finally { clearTimeout(timeout); }
}
