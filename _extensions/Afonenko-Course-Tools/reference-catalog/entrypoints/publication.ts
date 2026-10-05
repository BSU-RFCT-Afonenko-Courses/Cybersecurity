import { dirname, fromFileUrl, join } from "../infrastructure/files.ts";
import { publish } from "../infrastructure/publish.ts";
const extension = dirname(dirname(fromFileUrl(import.meta.url)));
/** Структурный адаптер project-publish: импорт пакета координатора не требуется. */
export default {
  metadata({ namespace, format, config }: { namespace?: string; format: string; config?: Record<string, unknown> }) {
    if (format !== "html" && format !== "revealjs") return {};
    // Штатная конфигурация портала уже подключает фильтры и shortcode расширения.
    if (namespace === undefined && Array.isArray(config?.filters) && config.filters.includes("reference-catalog")) return {};
    return {
      ...(namespace === undefined ? {} : { "reference-catalog": { namespace } }),
      filters: [{ at: "pre-ast", path: join(extension, "lua/requests.lua") }, { at: "post-ast", path: join(extension, "lua/probes.lua") }],
      shortcodes: [join(extension, "lua/shortcodes.lua")],
    };
  },
  finalize: publish,
};
