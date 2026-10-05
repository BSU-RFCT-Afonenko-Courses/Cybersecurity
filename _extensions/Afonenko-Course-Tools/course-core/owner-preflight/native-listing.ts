/** Finite stock table model derived only from current public native inspect and Source bytes.
 * This module creates no delivery permission. Lua must prove the native constructor;
 * completion separately binds each typed source edge to its current native writer.
 */
import type { NativeListingProviderBinding } from "./native-listing-provider.ts";
export type NativeListingProfile = "student" | "full";
export type NativeListingField = "title" | "semester" | "categories";
export interface NativeListingWriter {
  source: string;
  sourceHash: string;
  documentInspectHash: string;
  inspectedOutputFile: string;
  artifact: string;
  outputUri: string;
}
export interface NativeListingRow {
  source: string;
  sourceHash: string;
  sourceSha1: string;
  sourceBytes: number;
  mtimeMs: number;
  reader: string;
  documentInspectHash: string;
  sourceHref: string;
  categories: string[];
  semester?: number;
  title: { kind: "metadata"; value: string } | { kind: "source-header" };
  writer: NativeListingWriter;
}
export interface NativeListingDeclaration {
  index: number;
  id: string;
  fields: NativeListingField[];
  displayNames: { title: string; categories: string; semester?: string };
  selector: { depth: 1 | 2 };
  include?: { difficulty?: string; semester?: number };
  sort: "title";
  pageSize: 10 | 30;
  filterUi: false;
  sortUi: false;
  noMatches: string;
  rows: NativeListingRow[];
}
export interface NativeListingPlan {
  protocol: 1;
  key: string;
  root: string;
  profile: NativeListingProfile;
  source: string;
  sourceHash: string;
  sourceSha1: string;
  sourceBytes: number;
  mtimeMs: number;
  documentInspectHash: string;
  reader: string;
  inputConstructor: "identity" | "book-part-title-transfer";
  providerHash: string;
  providerVersion: "1.10.18" | "1.11.5";
  sourceWriter: NativeListingWriter;
  selectedWriters: NativeListingWriter[];
  declarations: NativeListingDeclaration[];
  libraryDirectory: string;
  appendOrder: [
    "quarto-navigation-envelope",
    "quarto-listing-pipeline",
    "quarto-meta-markdown",
  ];
  planHash: string;
}
export type NativeListingPlans = Record<string, NativeListingPlan>;
export interface AuditNativeListingsInput {
  root: string;
  profile: NativeListingProfile;
  /** Complete public ProjectInspect, including dir/files/config. */
  project: any;
  /** Already obtained public DocumentInspect values keyed by relative selected Source. */
  documents: Record<string, any>;
  provider: NativeListingProviderBinding;
  documentHashes?: Record<string, string>;
}
export class NativeListingFailure extends Error {
  constructor(public code: string, public override cause: unknown) {
    super(`${code}: ${JSON.stringify(cause)}`);
  }
}
function fail(code: string, cause: unknown): never {
  throw new NativeListingFailure(code, cause);
}
function unsupported(cause: unknown): never {
  return fail("SOURCE.NATIVE_LISTING_UNSUPPORTED", cause);
}
function object(x: unknown): x is Record<string, any> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}
function keys(value: any, allowed: string[]) {
  if (!object(value) || Object.keys(value).some((k) => !allowed.includes(k))) {
    unsupported(value);
  }
}
function path(value: unknown): string {
  if (
    typeof value !== "string" || !value || value.startsWith("/") ||
    value.includes("\\") || !/^[A-Za-z0-9À-ɏЀ-ԯ_.\-/]+$/u.test(value) ||
    value.split("/").some((x) => !x || x === "." || x === "..")
  ) unsupported(value);
  return value;
}
export function nativeListingPlain(value: unknown): string {
  // Deliberately excludes markup delimiters, URI syntax and every attribute quote/control.
  if (
    typeof value !== "string" || !value || value.trim() !== value ||
    !/^[A-Za-z0-9À-ɏЀ-ԯ ,.\-]+$/u.test(value)
  ) unsupported(value);
  return value;
}
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
async function digest(bytes: Uint8Array, algorithm = "SHA-256") {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest(algorithm, new Uint8Array(bytes).buffer),
    ),
  ).map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function valueHash(value: unknown) {
  return await digest(new TextEncoder().encode(JSON.stringify(value)));
}
export async function nativeListingPlanHash(
  plan: Omit<NativeListingPlan, "planHash"> | NativeListingPlan,
) {
  const { planHash: _ignored, ...content } = plan as NativeListingPlan;
  return await valueHash(content);
}
function relativeSource(root: string, input: unknown) {
  if (typeof input !== "string" || !input.startsWith(root + "/")) {
    unsupported(input);
  }
  return path(input.slice(root.length + 1));
}
function normalized(parts: string[]) {
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!out.length) fail("SOURCE.NATIVE_LISTING_WRITER_INVALID", parts);
      out.pop();
    } else out.push(part);
  }
  return out.join("/");
}
export function nativeListingWriter(
  source: string,
  sourceHash: string,
  documentInspectHash: string,
  doc: any,
  root: string,
): NativeListingWriter {
  const raw = doc?.formats?.html?.pandoc?.["output-file"];
  if (
    doc?.formats?.html?.render?.["output-ext"] !== "html" ||
    typeof raw !== "string" ||
    !/^[A-Za-z0-9À-ɏЀ-ԯ_.\-]+\.html$/u.test(raw)
  ) fail("SOURCE.NATIVE_LISTING_WRITER_INVALID", raw);
  // Both pinned stock constructors preserve this relative basename in inspect;
  // resolveInputTarget's formatOutputFile then preserves its matching .html suffix.
  const artifact = normalized([...source.split("/").slice(0, -1), raw]);
  if (
    !artifact.endsWith(".html") || !/^[A-Za-z0-9À-ɏЀ-ԯ_.\-/]+$/u.test(artifact)
  ) fail("SOURCE.NATIVE_LISTING_WRITER_INVALID", raw);
  return {
    source,
    sourceHash,
    documentInspectHash,
    inspectedOutputFile: raw,
    artifact,
    outputUri: "/" + artifact,
  };
}
async function sourceFact(
  root: string,
  source: string,
  doc: any,
  documentHash?: string,
) {
  const absolute = root + "/" + path(source);
  const st = await Deno.lstat(absolute);
  if (
    !st.isFile || st.isSymlink || await Deno.realPath(absolute) !== absolute ||
    !st.mtime
  ) unsupported(source);
  const bytes = await Deno.readFile(absolute),
    format = doc?.formats?.html,
    info = doc?.fileInformation?.[absolute];
  if (
    !format || !info || !Array.isArray(info.codeCells) ||
    info.codeCells.length || !Array.isArray(info.includeMap) ||
    doc.engines?.join(",") !== "markdown" ||
    format.execute?.engine !== "markdown"
  ) unsupported({ source, engine: doc?.engines });
  const reader = format.pandoc?.from || "markdown";
  if (reader !== "markdown") unsupported({ source, reader });
  const sourceHash = await digest(bytes),
    sourceSha1 = await digest(bytes, "SHA-1"),
    documentInspectHash = documentHash || await valueHash(doc);
  if (!/^[a-f0-9]{64}$/.test(documentInspectHash)) {
    unsupported(documentInspectHash);
  }
  return {
    source,
    sourceHash,
    sourceSha1,
    sourceBytes: bytes.length,
    mtimeMs: st.mtime.getTime(),
    reader,
    documentInspectHash,
    metadata: format.metadata || {},
    authored: info.metadata || {},
    includeMap: info.includeMap,
    writer: nativeListingWriter(
      source,
      sourceHash,
      documentInspectHash,
      doc,
      root,
    ),
  };
}
function inputConstructor(
  project: any,
  source: string,
  doc: any,
  fact: any,
): NativeListingPlan["inputConstructor"] {
  if (project.config.project.type !== "book" || /^index\./.test(source)) {
    return "identity";
  }
  const entries = project.config.book?.render?.filter((x: any) =>
    x.file === source
  );
  if (
    !Array.isArray(entries) || entries.length !== 1 ||
    entries[0].type !== "part" || entries[0].number !== undefined ||
    entries[0].appendix !== undefined ||
    doc.formats.html.extensions?.book?.multiFile !== true ||
    Object.hasOwn(fact.authored, "title") ||
    Object.hasOwn(fact.metadata, "title")
  ) fail("SOURCE.NATIVE_LISTING_INPUT_CONSTRUCTOR_UNSUPPORTED", source);
  return "book-part-title-transfer";
}
function finiteNativePipeline(
  root: string,
  project: any,
  documents: Record<string, any>,
  provider: NativeListingProviderBinding,
) {
  if (
    !["default", "website", "book"].includes(
      project.config?.project?.type || "default",
    )
  ) {
    unsupported("unknown native Listing project constructor");
  }
  const filters = project.config?.filters;
  if (
    ![
      "course-core",
      "course-core,course-presentation",
      "course-core,course-presentation,project-download",
    ].includes(filters?.join(","))
  ) unsupported("unknown Listing provider filter chain");
  const extensions = project.extensions || [];
  const find = (name: string) =>
    extensions.filter((x: any) => x.id?.name === name);
  const core = find("course-core");
  if (core.length !== 1) unsupported("native Core provider identity");
  const corePath = relativeSource(root, core[0].path);
  const download = find("project-download");
  if (filters.includes("project-download") && download.length !== 1) {
    unsupported("native Download provider identity");
  }
  const downloadPath = download.length === 1
    ? relativeSource(root, download[0].path)
    : undefined;
  const pre = [
    `${corePath}/entrypoints/pre.ts`,
    ...(filters.includes("project-download")
      ? [`${downloadPath}/entrypoints/pre.ts`]
      : []),
    `${corePath}/entrypoints/owner-freeze.ts`,
  ];
  const post = [
    `${corePath}/entrypoints/post.ts`,
    ...(filters.includes("project-download")
      ? [`${downloadPath}/entrypoints/post.ts`]
      : []),
  ];
  // Known hooks may be omitted except the last mandatory freeze guard; no additional hook.
  const actualPre = project.config.project["pre-render"] || [],
    actualPost = project.config.project["post-render"] || [];
  if (
    !Array.isArray(actualPre) || actualPre.at(-1) !== pre.at(-1) ||
    actualPre.some((x: string, i: number) =>
      !pre.includes(x) || actualPre.indexOf(x) !== i
    ) ||
    actualPre.some((x: string, i: number) =>
      i > 0 && pre.indexOf(actualPre[i - 1]) >= pre.indexOf(x)
    ) || !Array.isArray(actualPost) ||
    actualPost.some((x: string, i: number) =>
      !post.includes(x) || actualPost.indexOf(x) !== i
    ) ||
    actualPost.some((x: string, i: number) =>
      i > 0 && post.indexOf(actualPost[i - 1]) >= post.indexOf(x)
    )
  ) unsupported("unknown/reordered native Listing preprocessing hooks");
  for (const extension of extensions) {
    const contributes = extension.contributes || {};
    if (
      Object.keys(contributes.project || {}).length ||
      Object.keys(contributes.formats?.html || {}).length
    ) unsupported("custom native project/HTML constructor");
    if (contributes.engines?.length) {
      // The stock globally registered, unselected Julia extension is not a selected producer.
      const expected = provider.sharePath +
        "/extension-subtrees/julia-engine/_extensions/julia-engine";
      if (
        extension.id?.name !== "julia-engine" || extension.path !== expected ||
        contributes.engines.length !== 1 ||
        contributes.engines[0].path !== expected + "/julia-engine.js"
      ) unsupported("unknown native engine extension");
    }
  }
  for (const [source, doc] of Object.entries(documents)) {
    // Stock formatsPreferHtml picks the first HTML-family name, not necessarily html.
    // html plus optional pdf makes the chosen inspected writer unambiguous.
    if (
      !object(doc.formats) || !object(doc.formats.html) ||
      Object.keys(doc.formats).some((name) => name !== "html" && name !== "pdf")
    ) {
      unsupported({
        source,
        reason: "unproved native HTML-family constructor preference",
      });
    }
    const format = doc.formats.html;
    if (
      !same(format?.pandoc?.filters, filters) ||
      format.pandoc?.["lua-filter"] !== undefined ||
      format.pandoc?.reader !== undefined
    ) unsupported({ source, reason: "custom native reader/filter chain" });
    const custom = format.extensions || {};
    if (
      Object.keys(custom).some((k) => k !== "book") ||
      custom.book && !same(custom.book, { multiFile: true })
    ) unsupported({ source, reason: "custom HTML/book extension" });
  }
}
/** No native invocation. Every input fact originates in existing current public inspect. */
export async function auditNativeListings(
  args: AuditNativeListingsInput,
): Promise<NativeListingPlans> {
  const { root, profile, project, documents, provider } = args;
  if (
    !root.startsWith("/") || root.endsWith("/") || project?.dir !== root ||
    !["student", "full"].includes(profile) ||
    !Array.isArray(project?.files?.input) ||
    !["1.10.18", "1.11.5"].includes(provider?.version) ||
    !/^[a-f0-9]{64}$/.test(provider?.sha256)
  ) unsupported("native inspect/provider identity");
  finiteNativePipeline(root, project, documents, provider);
  const selected = project.files.input.map((x: unknown) =>
    relativeSource(root, x)
  );
  if (
    !selected.length || new Set(selected).size !== selected.length ||
    Object.keys(documents).some((x) => !selected.includes(x))
  ) unsupported("native selected inputs");
  const facts: Record<string, Awaited<ReturnType<typeof sourceFact>>> = {};
  for (const source of selected) {
    if (!documents[source] || !source.endsWith(".qmd")) unsupported(source);
    facts[source] = await sourceFact(
      root,
      source,
      documents[source],
      args.documentHashes?.[source],
    );
  }
  const writers = selected.map((x: string) => facts[x].writer);
  if (
    new Set(writers.map((x: NativeListingWriter) => x.artifact)).size !==
      writers.length
  ) fail("SOURCE.NATIVE_LISTING_WRITER_INVALID", "ambiguous native outputs");
  const plans: NativeListingPlans = {};
  for (const source of [...selected].sort()) {
    const fact = facts[source], native = fact.metadata.listing;
    if (native === undefined) continue;
    if (fact.includeMap.length || !same(native, fact.authored.listing)) {
      unsupported({
        source,
        reason: "listing emitter is not bare static authored declaration",
      });
    }
    const list = Array.isArray(native) ? native : [native];
    if (!list.length || list.length > 3) unsupported(native);
    const declarations: NativeListingDeclaration[] = [];
    const ids = new Set<string>();
    for (let index = 0; index < list.length; index++) {
      const d = list[index];
      keys(d, [
        "id",
        "contents",
        "type",
        "fields",
        "field-display-names",
        "sort",
        "filter-ui",
        "sort-ui",
        "include",
        "page-size",
      ]);
      if (
        typeof d.id !== "string" || !/^[a-z][a-z0-9-]*$/.test(d.id) ||
        ids.has(d.id) || d.type !== "table" ||
        !["*/index.qmd", "*/*/index.qmd"].includes(d.contents) ||
        !["title,categories", "title,semester,categories"].includes(
          d.fields?.join(","),
        ) || d.sort !== "title" || d["filter-ui"] !== false ||
        d["sort-ui"] !== false
      ) unsupported(d);
      ids.add(d.id);
      const names = d["field-display-names"];
      keys(names, d.fields);
      if (!same(Object.keys(names).sort(), [...d.fields].sort())) {
        unsupported(names);
      }
      const displayNames: any = {};
      for (const field of d.fields) {
        displayNames[field] = nativeListingPlain(names[field]);
      }
      const include = d.include;
      if (include !== undefined) {
        keys(include, ["difficulty", "semester"]);
        if (
          !Object.keys(include).length ||
          include.difficulty !== undefined &&
            !/^[a-z][a-z-]*$/.test(include.difficulty) ||
          include.semester !== undefined &&
            (!Number.isSafeInteger(include.semester) || include.semester < 1 ||
              include.semester > 16)
        ) unsupported(include);
      }
      const depth = d.contents === "*/index.qmd" ? 1 : 2,
        base = source.split("/").slice(0, -1).join("/");
      const matching = selected.filter((target: string) =>
        target !== source && (!base || target.startsWith(base + "/"))
      ).filter((target: string) => {
        const rel = base ? target.slice(base.length + 1) : target;
        const parts = rel.split("/");
        return parts.length === depth + 1 && parts.at(-1) === "index.qmd";
      });
      const rowSources = matching.filter((target: string) =>
        !include ||
        Object.entries(include).every(([k, v]) =>
          facts[target].metadata[k] === v
        )
      );
      const pageSize = d["page-size"] === undefined ? 30 : d["page-size"];
      if (
        ![10, 30].includes(pageSize) || !rowSources.length ||
        rowSources.length > pageSize
      ) unsupported({ id: d.id, pageSize, rows: rowSources.length });
      const rows: NativeListingRow[] = rowSources.map((target: string) => {
        const f = facts[target], meta = f.metadata;
        if (
          f.reader !== fact.reader || !Array.isArray(meta.categories) ||
          !meta.categories.length ||
          new Set(meta.categories).size !== meta.categories.length
        ) unsupported(target);
        const categories = meta.categories.map(nativeListingPlain);
        if (
          meta.semester !== undefined &&
            (!Number.isSafeInteger(meta.semester) || meta.semester < 1 ||
              meta.semester > 16) ||
          d.fields.includes("semester") && meta.semester === undefined
        ) unsupported(target);
        const title: NativeListingRow["title"] = meta.title === undefined
          ? { kind: "source-header" }
          : { kind: "metadata", value: nativeListingPlain(meta.title) };
        return {
          source: target,
          sourceHash: f.sourceHash,
          sourceSha1: f.sourceSha1,
          sourceBytes: f.sourceBytes,
          mtimeMs: f.mtimeMs,
          reader: f.reader,
          documentInspectHash: f.documentInspectHash,
          sourceHref: "/" + target,
          categories,
          ...(meta.semester === undefined ? {} : { semester: meta.semester }),
          title,
          writer: f.writer,
        };
      });
      const noMatches = nativeListingPlain(
        documents[source].formats.html.language?.["listing-page-no-matches"],
      );
      declarations.push({
        index,
        id: d.id,
        fields: [...d.fields],
        displayNames,
        selector: { depth },
        ...(include ? { include: { ...include } } : {}),
        sort: "title",
        pageSize,
        filterUi: false,
        sortUi: false,
        noMatches,
        rows,
      });
    }
    const libraryDirectory = path(
      project.config.project["lib-dir"] || "site_libs",
    );
    const content: Omit<NativeListingPlan, "planHash"> = {
      protocol: 1,
      key: `${profile}:${source}`,
      root,
      profile,
      source,
      sourceHash: fact.sourceHash,
      sourceSha1: fact.sourceSha1,
      sourceBytes: fact.sourceBytes,
      mtimeMs: fact.mtimeMs,
      documentInspectHash: fact.documentInspectHash,
      reader: fact.reader,
      inputConstructor: inputConstructor(
        project,
        source,
        documents[source],
        fact,
      ),
      providerHash: provider.sha256,
      providerVersion: provider.version,
      sourceWriter: fact.writer,
      selectedWriters: writers,
      declarations,
      libraryDirectory,
      appendOrder: [
        "quarto-navigation-envelope",
        "quarto-listing-pipeline",
        "quarto-meta-markdown",
      ],
    };
    const plan = { ...content, planHash: await nativeListingPlanHash(content) };
    plans[plan.key] = plan;
  }
  await validateNativeListingPlans(plans);
  return plans;
}
export async function validateNativeListingPlans(plans: NativeListingPlans) {
  if (!object(plans)) unsupported(plans);
  const temp = await Deno.makeTempFile({
    prefix: "native-listing-model-",
    suffix: ".json",
  });
  try {
    await Deno.writeTextFile(temp, JSON.stringify({ input: { plans } }));
    const schema = new URL("./native-listing.cue", import.meta.url).pathname;
    const result = await new Deno.Command(Deno.env.get("CUE") || "cue", {
      args: ["export", schema, temp, "-e", "input.plans", "--out", "json"],
      stdout: "piped",
      stderr: "piped",
    }).output();
    if (result.code) {
      unsupported({
        reason: "closed CUE model",
        detail: new TextDecoder().decode(result.stderr),
      });
    }
  } finally {
    await Deno.remove(temp);
  }

  for (const [key, p] of Object.entries(plans)) {
    keys(p, [
      "protocol",
      "key",
      "root",
      "profile",
      "source",
      "sourceHash",
      "sourceSha1",
      "sourceBytes",
      "mtimeMs",
      "documentInspectHash",
      "reader",
      "inputConstructor",
      "providerHash",
      "providerVersion",
      "sourceWriter",
      "selectedWriters",
      "declarations",
      "libraryDirectory",
      "appendOrder",
      "planHash",
    ]);
    if (
      p.protocol !== 1 || p.key !== key || key !== `${p.profile}:${p.source}` ||
      !same(p.appendOrder, [
        "quarto-navigation-envelope",
        "quarto-listing-pipeline",
        "quarto-meta-markdown",
      ]) || p.reader !== "markdown" ||
      !["identity", "book-part-title-transfer"].includes(p.inputConstructor) ||
      p.planHash !== await nativeListingPlanHash(p)
    ) unsupported({ key, reason: "closed plan/hash" });
    path(p.source);
    path(p.libraryDirectory);
    const writerSources = new Map<string, NativeListingWriter>();
    const writerArtifacts = new Set<string>();
    for (const w of p.selectedWriters) {
      keys(w, [
        "source",
        "sourceHash",
        "documentInspectHash",
        "inspectedOutputFile",
        "artifact",
        "outputUri",
      ]);
      path(w.source);
      if (
        writerSources.has(w.source) || writerArtifacts.has(w.artifact) ||
        !same(
          w,
          nativeListingWriter(w.source, w.sourceHash, w.documentInspectHash, {
            formats: {
              html: {
                render: { "output-ext": "html" },
                pandoc: { "output-file": w.inspectedOutputFile },
              },
            },
          }, p.root),
        )
      ) unsupported({ key, reason: "selected writer constructor/uniqueness" });
      writerSources.set(w.source, w);
      writerArtifacts.add(w.artifact);
    }
    if (
      !same(p.sourceWriter, writerSources.get(p.source)) ||
      p.sourceWriter.sourceHash !== p.sourceHash ||
      p.sourceWriter.documentInspectHash !== p.documentInspectHash ||
      new Set(p.declarations.map((d) => d.id)).size !== p.declarations.length
    ) unsupported({ key, reason: "emitter/current writer binding" });

    for (const d of p.declarations) {
      keys(d, [
        "index",
        "id",
        "fields",
        "displayNames",
        "selector",
        "include",
        "sort",
        "pageSize",
        "filterUi",
        "sortUi",
        "noMatches",
        "rows",
      ]);
      if (
        d.index !== p.declarations.indexOf(d) || d.sort !== "title" ||
        d.filterUi !== false || d.sortUi !== false ||
        ![10, 30].includes(d.pageSize) || !d.rows.length ||
        d.rows.length > d.pageSize
      ) unsupported(d);
      if (
        new Set(d.rows.map((r) => r.source)).size !== d.rows.length ||
        d.include && !Object.keys(d.include).length
      ) unsupported(d);
      const base = p.source.split("/").slice(0, -1).join("/");
      for (const r of d.rows) {
        keys(r, [
          "source",
          "sourceHash",
          "sourceSha1",
          "sourceBytes",
          "mtimeMs",
          "reader",
          "documentInspectHash",
          "sourceHref",
          "categories",
          "semester",
          "title",
          "writer",
        ]);
        const relative = base && r.source.startsWith(base + "/")
          ? r.source.slice(base.length + 1)
          : !base
          ? r.source
          : undefined;
        if (
          !relative || relative.split("/").length !== d.selector.depth + 1 ||
          relative.split("/").at(-1) !== "index.qmd" || r.source === p.source ||
          r.sourceHref !== "/" + path(r.source) || r.reader !== p.reader ||
          !same(r.writer, writerSources.get(r.source)) ||
          r.sourceHash !== r.writer.sourceHash ||
          r.documentInspectHash !== r.writer.documentInspectHash ||
          !Number.isSafeInteger(r.sourceBytes) || r.sourceBytes < 1 ||
          r.title.kind === "metadata" &&
            nativeListingPlain(r.title.value) !== r.title.value ||
          new Set(r.categories).size !== r.categories.length
        ) unsupported(r);
        r.categories.forEach(nativeListingPlain);
      }
    }
  }
}
/** Current immutable source/stat witnesses; no engine and no receipt reuse. */
export async function currentNativeListingPlans(plans: NativeListingPlans) {
  await validateNativeListingPlans(plans);
  const seen = new Set<string>();
  for (const p of Object.values(plans)) {
    for (
      const source of [
        p.source,
        ...p.selectedWriters.map((x) => x.source),
      ]
    ) {
      const absolute = p.root + "/" + source;
      if (seen.has(absolute)) continue;
      seen.add(absolute);
      const fact = source === p.source
        ? p
        : p.declarations.flatMap((x) => x.rows).find((x) =>
          x.source === source
        );
      const writer = p.selectedWriters.find((x) => x.source === source)!;
      let st: Deno.FileInfo, bytes: Uint8Array;
      try {
        st = await Deno.lstat(absolute);
        bytes = await Deno.readFile(absolute);
      } catch {
        fail("SOURCE.NATIVE_LISTING_SOURCE_CHANGED", source);
      }
      if (
        !st!.isFile || st!.isSymlink ||
        await Deno.realPath(absolute) !== absolute ||
        await digest(bytes!) !== writer.sourceHash ||
        fact &&
          (bytes!.length !== fact.sourceBytes ||
            st!.mtime?.getTime() !== fact.mtimeMs)
      ) fail("SOURCE.NATIVE_LISTING_SOURCE_CHANGED", source);
    }
  }
}
/** Exact templateJsScript bodies plus scriptFileForScripts' leading LF; equality only. */
export function nativeListingInitializer(plan: NativeListingPlan): string {
  return "\n" + plan.declarations.map((d) => {
    if (
      !/^[a-z][a-z0-9-]*$/.test(d.id) ||
      !["title,categories", "title,semester,categories"].includes(
        d.fields.join(","),
      ) || d.filterUi !== false || d.sortUi !== false || d.sort !== "title" ||
      ![10, 30].includes(d.pageSize) || d.rows.length > d.pageSize
    ) unsupported(d);
    const names = d.fields.map((field) => `'listing-${field}'`);
    names.push(
      "{ data: ['index'] }",
      "{ data: ['categories'] }",
      "{ data: ['listing-date-sort'] }",
      "{ data: ['listing-title-sort'] }",
    );
    return `
  window.document.addEventListener("DOMContentLoaded", function (_event) {
    const listingTargetEl = window.document.querySelector('#listing-${d.id} .list');
    if (!listingTargetEl) {
      // No listing discovered, do not attach.
      return; 
    }

    const options = {
      valueNames: [${names.join(",")}],
      
      searchColumns: ["listing-title","listing-author"],
    };

    window['quarto-listings'] = window['quarto-listings'] || {};
    window['quarto-listings']['listing-${d.id}'] = new List('listing-${d.id}', options);

    if (window['quarto-listing-loaded']) {
      window['quarto-listing-loaded']();
    }
  });

  window.addEventListener('hashchange',() => {
    if (window['quarto-listing-loaded']) {
      window['quarto-listing-loaded']();
    }
  })
  `;
  }).join("\n");
}
