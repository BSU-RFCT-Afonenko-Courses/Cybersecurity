import { fail } from "../contracts/project.ts";
export type CatalogueReference = { token: string; key: string; style: string };
export const catalogueReference = (
  key: string,
  style: string,
): CatalogueReference => ({
  key,
  style,
  token: "course-reference:" + encodeURIComponent(key) + ":" +
    encodeURIComponent(style),
});
/** Existing QRC requests.lua Cite grammar and ordering, without catalogue lookup. */
export function catalogueCitations(
  node: any,
):
  | { reference: CatalogueReference; prefix: any[]; suffix: any[] }[]
  | undefined {
  if (node?.t !== "Cite") return;
  const rows = node.c?.[0];
  if (!Array.isArray(rows)) fail("QRC.REFERENCE_INVALID", "Повреждённый Cite");
  const selected = rows.map((row) =>
    typeof row.citationId === "string" &&
    /^[A-Za-z][A-Za-z0-9_-]*:[A-Za-z][^:]*-[^:]+$/.test(row.citationId)
  );
  if (!selected.some(Boolean)) return;
  if (!selected.every(Boolean)) {
    fail(
      "QRC.REFERENCE_INVALID",
      "Библиографические ссылки и ссылки каталога следует записывать отдельно",
    );
  }
  return rows.map((row) => {
    if (
      !Array.isArray(row.citationPrefix) || !Array.isArray(row.citationSuffix)
    ) fail("QRC.REFERENCE_INVALID", "Повреждённые prefix/suffix");
    return {
      reference: catalogueReference(
        row.citationId,
        row.citationMode?.t === "SuppressAuthor" ? "number" : "default",
      ),
      prefix: structuredClone(row.citationPrefix),
      suffix: structuredClone(row.citationSuffix),
    };
  });
}
export function catalogueCiteInlines(
  rows: NonNullable<ReturnType<typeof catalogueCitations>>,
  link: (ref: CatalogueReference) => any,
) {
  const out: any[] = [];
  rows.forEach((row, i) => {
    if (i) out.push({ t: "Str", c: ";" }, { t: "Space" });
    out.push(...row.prefix);
    if (row.prefix.length) out.push({ t: "Space" });
    out.push(link(row.reference));
    if (row.suffix.length) out.push({ t: "Space" }, ...row.suffix);
  });
  return out;
}
