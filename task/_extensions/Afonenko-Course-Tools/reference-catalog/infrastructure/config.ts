import { diagnostic } from "../diagnostics.ts";
import { configKeys } from "../domain/contract.ts";
import { isRecord, parseImports } from "./import-config.ts";
import { parseExports, parsePublication } from "./export-config.ts";
export function catalogConfig(raw: unknown, root: string, namespaces: string[]) {
  const config = raw ?? {};
  if (!isRecord(config)) throw diagnostic("QRC.CONFIG_INVALID", "reference-catalog должен быть отображением", { source: root, field: "reference-catalog" });
  for (const key of Object.keys(config)) if (!(configKeys as readonly string[]).includes(key)) throw diagnostic("QRC.CONFIG_INVALID", `неизвестное свойство reference-catalog.${key}`, { source: root, field: `reference-catalog.${key}` });
  return { imports: parseImports(config.imports, root, namespaces), exports: parseExports(config.exports, namespaces), publication: parsePublication(config.publication) };
}
