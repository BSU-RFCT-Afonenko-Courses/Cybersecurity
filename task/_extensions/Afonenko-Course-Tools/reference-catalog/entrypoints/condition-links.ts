import { diagnostic } from "../diagnostics.ts";
import { createBodyLinks } from "./body-links.ts";
import type { Target } from "../domain/model.ts";

export interface ConditionLinkDestination {
  catalog: unknown;
  baseUrl: string;
  importedTargets?: Target[];
  catalogBaseUrl?: string;
  sources?: Record<string, string>;
  resourceLinks?: readonly string[];
  /** Ключ — ссылка позднего тела; output предоставляет Publisher. */
  urls?: Record<string, string>;
  references?: Record<string, { key: string; style?: string }>;
}

/** Адреса выбранного условия без повторного чтения/преобразования его тела. */
export function bindConditionLinks(
  condition: { context: { input: string }; links: readonly string[] },
  destination: ConditionLinkDestination,
): Record<string, string> {
  const resolver = createBodyLinks({
    ...destination,
    baseUrl: destination.catalogBaseUrl ?? destination.baseUrl,
  });
  const result: Record<string, string> = Object.create(null);
  for (const link of condition.links) {
    // Полный набор локальных IDs и их проверка принадлежат Core writer.
    if (link.startsWith("#")) continue;
    if (destination.resourceLinks?.includes(link)) continue;
    const reference = Object.hasOwn(destination.references ?? {}, link)
      ? destination.references![link]
      : undefined;
    if (reference) {
      result[link] = resolver.resolve(
        reference.key,
        reference.style ?? "default",
        condition.context.input,
      ).href;
      continue;
    }
    const explicit = Object.hasOwn(destination.urls ?? {}, link)
      ? destination.urls![link]
      : undefined;
    let nativeOutput: string | undefined;
    if (
      !explicit && destination.sources && !/^[a-z][a-z0-9+.-]*:/i.test(link)
    ) {
      const url = new URL(
        link,
        "https://native.invalid/" + condition.context.input.replace(/^\//, ""),
      );
      const source = decodeURIComponent(url.pathname.slice(1));
      const output = url.origin === "https://native.invalid"
        ? destination.sources[source]
        : undefined;
      if (output) {
        if (
          output.startsWith("/") || /[\\?#:]/.test(output) ||
          output.split("/").some((part) =>
            !part || part === "." || part === ".."
          )
        ) {
          throw diagnostic(
            "QRC.REFERENCE_INVALID",
            "Некорректный native output",
            { source: condition.context.input, id: link, field: "sources" },
          );
        }
        const final = new URL(output, destination.baseUrl);
        final.search = url.search;
        final.hash = url.hash;
        nativeOutput = final.href;
      }
    }
    const address = explicit ?? nativeOutput ??
      (/^(https?:|mailto:)/i.test(link) ? link : undefined);
    try {
      if (
        !address ||
        [...address].some((c) =>
          c.charCodeAt(0) <= 32 || c === "<" || c === ">"
        )
      ) throw Error("URL");
      const url = new URL(address, destination.baseUrl);
      if (!["https:", "http:", "mailto:"].includes(url.protocol)) {
        throw Error("URL");
      }
      result[link] = url.href;
    } catch (cause) {
      throw diagnostic(
        "QRC.REFERENCE_INVALID",
        "Для ссылки условия нужен явный конечный адрес или цель каталога",
        { source: condition.context.input, id: link, field: "links" },
        cause,
      );
    }
  }
  return result;
}
